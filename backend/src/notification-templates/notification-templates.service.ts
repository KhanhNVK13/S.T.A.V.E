import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NotificationTemplateItem,
  NotificationTemplatePreview,
} from '@stave/shared-types';
import {
  NOTIFICATION_PLACEHOLDER_SAMPLES,
  TEMPLATE_BODY_MAX_LENGTH,
  TEMPLATE_NAME_MAX_LENGTH,
  TEMPLATE_SUBJECT_MAX_LENGTH,
  renderPreview,
  validateTemplatePlaceholders,
} from '@stave/shared-types';
import {
  NOTIFICATION_TYPES,
  getNotificationType,
} from '../notifications/notification-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type {
  CreateNotificationTemplateDto,
  PreviewNotificationTemplateDto,
} from './dto';

interface TemplateRow {
  id: string;
  type: string;
  name: string;
  subject: string;
  body_template: string;
  updated_at: string;
}

/** The three trimmed values a template is made of, after validation. */
interface TemplateValues {
  name: string;
  subject: string;
  bodyTemplate: string;
}

/**
 * Kết quả của `PUT`. `created` cho biết đây là lần tạo mới (201) hay lần
 * sửa (200) — hợp đồng API yêu cầu hai mã khác nhau.
 */
export interface UpsertTemplateResult {
  item: NotificationTemplateItem;
  created: boolean;
}

@Injectable()
export class NotificationTemplatesService {
  private readonly logger = new Logger(NotificationTemplatesService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async listTemplates(): Promise<NotificationTemplateItem[]> {
    const rows = await this.loadTemplates();
    const byType = new Map(rows.map((row) => [row.type, row]));

    return NOTIFICATION_TYPES.map(
      (definition): NotificationTemplateItem => {
        const row = byType.get(definition.type);
        return {
          type: definition.type,
          category: definition.category,
          mandatory: definition.mandatory,
          placeholders: definition.placeholders,
          template: row
            ? {
                id: row.id,
                name: row.name,
                subject: row.subject,
                bodyTemplate: row.body_template,
                updatedAt: row.updated_at,
              }
            : null,
        };
      },
    );
  }

  /**
   * Tạo mới khi loại chưa có mẫu, sửa khi đã có (UC-111).
   *
   * Khi sửa, bản **cũ** được chèn vào `notification_template_versions` **trước**
   * khi bản mới ghi đè (Q1: hai bước, không dùng RPC) — nếu bước cập nhật lỗi
   * thì dòng version thừa vô hại và mẫu cũ vẫn còn nguyên.
   */
  async upsertTemplate(
    adminId: string,
    type: string,
    dto: CreateNotificationTemplateDto,
  ): Promise<UpsertTemplateResult> {
    const definition = getNotificationType(type);
    if (!definition) {
      throw new NotFoundException('Notification type not found');
    }

    const values = this.validateValues(dto, definition.placeholders);

    const existing = await this.loadTemplateRow(type);
    if (!existing) {
      return {
        item: await this.insertTemplate(adminId, definition.type, values),
        created: true,
      };
    }

    // Kiểm đồng thời (Q3): lệch `updated_at` thì 409, không ghi gì.
    if (dto.expectedUpdatedAt && this.isStale(existing.updated_at, dto.expectedUpdatedAt)) {
      throw new ConflictException(
        'This template was changed by someone else. Please reload.',
      );
    }

    // Chèn bản CŨ vào lịch sử trước khi ghi bản mới.
    const { error: versionError } = await this.supabase
      .from('notification_template_versions')
      .insert({
        template_id: existing.id,
        type: existing.type,
        subject: existing.subject,
        body_template: existing.body_template,
        changed_by: adminId,
      });
    if (versionError) {
      this.logger.error(
        `Could not archive the previous template for ${type}: ${versionError.message}`,
      );
      throw new InternalServerErrorException('Could not update template');
    }

    const { data: updated, error: updateError } = await this.supabase
      .from('notification_templates')
      .update({
        name: values.name,
        subject: values.subject,
        body_template: values.bodyTemplate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existing.id)
      .select('id, type, name, subject, body_template, updated_at')
      .maybeSingle<TemplateRow>();
    if (updateError) {
      this.logger.error(
        `Could not update template for ${type}: ${updateError.message}`,
      );
      throw new InternalServerErrorException('Could not update template');
    }
    if (!updated) {
      this.logger.error(`Template update for ${type} returned no row`);
      throw new InternalServerErrorException('Could not update template');
    }

    await this.writeAuditLog(adminId, type, updated.id, 'notification_template.update');

    return { item: this.toItem(definition, updated), created: false };
  }

  /**
   * Xoá mẫu → hệ thống quay về wording mặc định (`defaultSubject`/`defaultBody`
   * trong `notification-types.ts`). Loại bắt buộc không xoá được (BR-126):
   * quyết định dựa trên cờ `mandatory` thật, không so tiền tố tên loại.
   */
  async deleteTemplate(adminId: string, type: string): Promise<void> {
    const definition = getNotificationType(type);
    if (!definition) {
      throw new NotFoundException('Notification type not found');
    }
    // Quyết định "bắt buộc" theo CỜ `mandatory` trong `notification-types.ts`,
    // không so tiền tố tên loại (UC-111: điểm dễ sai).
    if (definition.mandatory) {
      throw new ForbiddenException(
        'Mandatory notification types cannot be deleted',
      );
    }

    const existing = await this.loadTemplateRow(type);
    if (!existing) {
      throw new NotFoundException('Notification type not found');
    }

    const { error } = await this.supabase
      .from('notification_templates')
      .delete()
      .eq('id', existing.id);
    if (error) {
      this.logger.error(
        `Could not delete template for ${type}: ${error.message}`,
      );
      throw new InternalServerErrorException('Could not delete template');
    }

    await this.writeAuditLog(adminId, type, existing.id, 'notification_template.delete');
  }

  async preview(
    dto: PreviewNotificationTemplateDto,
  ): Promise<NotificationTemplatePreview> {
    const definition = getNotificationType(dto.type.trim());
    if (!definition) {
      throw new NotFoundException('Notification type not found');
    }

    const subject = dto.subject.trim();
    const bodyTemplate = dto.bodyTemplate.trim();
    const validation = validateTemplatePlaceholders(
      subject,
      bodyTemplate,
      definition.placeholders,
    );
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Template placeholders are invalid',
        invalid: validation.invalid,
        malformed: validation.malformed,
      });
    }

    return {
      subject: renderPreview(subject, NOTIFICATION_PLACEHOLDER_SAMPLES),
      body: renderPreview(bodyTemplate, NOTIFICATION_PLACEHOLDER_SAMPLES),
    };
  }

  /**
   * Kiểm rồi cắt khoảng trắng giá trị nhập. Dùng chung cho tạo mới và sửa để
   * hai đường không lệch quy tắc.
   */
  private validateValues(
    dto: CreateNotificationTemplateDto,
    placeholders: string[],
  ): TemplateValues {
    const name = dto.name.trim();
    const subject = dto.subject.trim();
    const bodyTemplate = dto.bodyTemplate.trim();

    if (!name) {
      throw new BadRequestException('Template name is required');
    }
    if (name.length > TEMPLATE_NAME_MAX_LENGTH) {
      throw new BadRequestException(
        `Template name must be at most ${TEMPLATE_NAME_MAX_LENGTH} characters`,
      );
    }
    if (!subject) {
      throw new BadRequestException('Template subject is required');
    }
    if (subject.length > TEMPLATE_SUBJECT_MAX_LENGTH) {
      throw new BadRequestException(
        `Template subject must be at most ${TEMPLATE_SUBJECT_MAX_LENGTH} characters`,
      );
    }
    if (!bodyTemplate) {
      throw new BadRequestException('Template content is required');
    }
    if (bodyTemplate.length > TEMPLATE_BODY_MAX_LENGTH) {
      throw new BadRequestException(
        `Template content must be at most ${TEMPLATE_BODY_MAX_LENGTH} characters`,
      );
    }

    const validation = validateTemplatePlaceholders(
      subject,
      bodyTemplate,
      placeholders,
    );
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Template placeholders are invalid',
        invalid: validation.invalid,
        malformed: validation.malformed,
      });
    }

    return { name, subject, bodyTemplate };
  }

  /**
   * So sánh hai mốc thời gian theo **giá trị**, không theo chuỗi: Postgres trả
   * `2026-11-11T10:00:00+00:00` còn giao diện gửi `2026-11-11T10:00:00.000Z` —
   * cùng một thời điểm nhưng khác chuỗi. Mốc không đọc được thì coi như lệch
   * để an toàn (báo 409 thay vì ghi đè).
   */
  private isStale(currentUpdatedAt: string, expectedUpdatedAt: string): boolean {
    const current = Date.parse(currentUpdatedAt);
    const expected = Date.parse(expectedUpdatedAt);
    if (Number.isNaN(current) || Number.isNaN(expected)) return true;
    return current !== expected;
  }

  private async insertTemplate(
    adminId: string,
    type: string,
    values: TemplateValues,
  ): Promise<NotificationTemplateItem> {
    const definition = getNotificationType(type);
    if (!definition) {
      throw new NotFoundException('Notification type not found');
    }

    const { data: inserted, error: insertError } = await this.supabase
      .from('notification_templates')
      .insert({
        type,
        name: values.name,
        subject: values.subject,
        body_template: values.bodyTemplate,
      })
      .select('id, type, name, subject, body_template, updated_at')
      .maybeSingle<TemplateRow>();
    if (insertError) {
      this.logger.error(
        `Could not create template for ${type}: ${insertError.message}`,
      );
      throw new InternalServerErrorException('Could not create template');
    }
    if (!inserted) {
      this.logger.error(`Template insert for ${type} returned no row`);
      throw new InternalServerErrorException('Could not create template');
    }

    await this.writeAuditLog(adminId, type, inserted.id, 'notification_template.create');

    return this.toItem(definition, inserted);
  }

  private toItem(
    definition: { type: string; category: string; mandatory: boolean; placeholders: string[] },
    row: TemplateRow,
  ): NotificationTemplateItem {
    return {
      type: definition.type,
      category: definition.category,
      mandatory: definition.mandatory,
      placeholders: definition.placeholders,
      template: {
        id: row.id,
        name: row.name,
        subject: row.subject,
        bodyTemplate: row.body_template,
        updatedAt: row.updated_at,
      },
    };
  }

  private async loadTemplateRow(type: string): Promise<TemplateRow | null> {
    const { data, error } = await this.supabase
      .from('notification_templates')
      .select('id, type, name, subject, body_template, updated_at')
      .eq('type', type)
      .maybeSingle<TemplateRow>();
    if (error) {
      this.logger.error(
        `Could not read the template for ${type}: ${error.message}`,
      );
      throw new InternalServerErrorException('Could not load template');
    }
    return (data as TemplateRow | null) ?? null;
  }

  private async loadTemplates(): Promise<TemplateRow[]> {
    const { data, error } = await this.supabase
      .from('notification_templates')
      .select('id, type, name, subject, body_template, updated_at');
    if (error) {
      this.logger.error(`Could not read notification templates: ${error.message}`);
      throw new InternalServerErrorException('Could not load templates');
    }
    return (data ?? []) as TemplateRow[];
  }

  /**
   * Ghi nhật ký quản trị. Lỗi audit **không** được làm hỏng response — thao
   * tác đã ghi xong thì vẫn thành công, chỉ ghi log để điều tra sau (mẫu:
   * `AdminService.writeAuditLog`).
   */
  private async writeAuditLog(
    adminId: string,
    type: string,
    templateId: string,
    action: string,
  ): Promise<void> {
    try {
      const { error } = await this.supabase.from('admin_audit_log').insert({
        admin_id: adminId,
        action,
        target_type: 'notification_template',
        target_id: templateId,
        reason: type,
      });
      if (error) {
        this.logger.error(
          `Could not write audit entry for ${type} (${templateId}): ${error.message}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Could not write audit entry for ${type} (${templateId}): ${err}`,
      );
    }
  }
}
