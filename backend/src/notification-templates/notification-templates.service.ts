import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  NotificationTemplateInfo,
  NotificationTemplatePreview,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import {
  getNotificationType,
  NOTIFICATION_TYPES,
  type NotificationTypeDefinition,
} from '../notifications/notification-types';
import {
  findInvalidPlaceholders,
  renderPreview,
} from './notification-templates.logic';
import type {
  PreviewTemplateDto,
  SaveTemplateDto,
} from './dto/template-text.dto';

interface TemplateRow {
  type: string;
  name: string;
  subject: string;
  body_template: string;
  updated_at: string;
}

@Injectable()
export class NotificationTemplatesService {
  private readonly logger = new Logger(NotificationTemplatesService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async list(): Promise<NotificationTemplateInfo[]> {
    const { data, error } = await this.supabase
      .from('notification_templates')
      .select('type, name, subject, body_template, updated_at')
      .returns<TemplateRow[]>();
    if (error) {
      this.logger.error(`Could not read templates: ${error.message}`);
      throw new InternalServerErrorException('Could not load templates');
    }
    const custom = new Map((data ?? []).map((row) => [row.type, row]));
    return NOTIFICATION_TYPES.map((definition) => {
      const row = custom.get(definition.type);
      return {
        type: definition.type,
        mandatory: definition.mandatory,
        placeholders: definition.placeholders,
        defaultSubject: definition.defaultSubject,
        defaultBody: definition.defaultBody,
        custom: row
          ? {
              name: row.name,
              subject: row.subject,
              body: row.body_template,
              updatedAt: row.updated_at,
            }
          : null,
      };
    });
  }

  preview(dto: PreviewTemplateDto): NotificationTemplatePreview {
    const definition = this.requireType(dto.type);
    this.assertPlaceholders(dto.subject, dto.body, definition);
    return renderPreview(dto.subject, dto.body, definition.placeholders);
  }

  async save(
    adminId: string,
    type: string,
    dto: SaveTemplateDto,
  ): Promise<{ created: boolean }> {
    const definition = this.requireType(type);
    this.assertPlaceholders(dto.subject, dto.body, definition);

    const { data, error } = await this.supabase.rpc(
      'admin_save_notification_template',
      {
        p_admin_id: adminId,
        p_type: type,
        p_name: dto.name,
        p_subject: dto.subject,
        p_body: dto.body,
      },
    );
    if (error) {
      this.logger.error(`admin_save_notification_template: ${error.message}`);
      throw new InternalServerErrorException('Could not save the template');
    }
    const row = (data as { o_created: boolean }[] | null)?.[0];
    if (!row)
      throw new InternalServerErrorException('Could not save the template');
    return { created: row.o_created };
  }

  async remove(adminId: string, type: string): Promise<void> {
    const definition = this.requireType(type);
    if (definition.mandatory) {
      throw new ForbiddenException({
        message: 'Required notification types cannot be reset',
        code: 'MANDATORY_TYPE',
      });
    }
    const { data, error } = await this.supabase.rpc(
      'admin_delete_notification_template',
      { p_admin_id: adminId, p_type: type },
    );
    if (error) {
      this.logger.error(`admin_delete_notification_template: ${error.message}`);
      throw new InternalServerErrorException('Could not delete the template');
    }
    if (data !== true) throw new NotFoundException('Template not found');
  }

  private requireType(type: string): NotificationTypeDefinition {
    const definition = getNotificationType(type);
    if (!definition) throw new NotFoundException('Unknown notification type');
    return definition;
  }

  private assertPlaceholders(
    subject: string,
    body: string,
    definition: NotificationTypeDefinition,
  ): void {
    const invalid = [
      ...new Set([
        ...findInvalidPlaceholders(subject, definition.placeholders),
        ...findInvalidPlaceholders(body, definition.placeholders),
      ]),
    ];
    if (invalid.length > 0) {
      throw new BadRequestException({
        message: 'Unknown placeholders',
        code: 'UNKNOWN_PLACEHOLDER',
        placeholders: invalid,
      });
    }
  }
}
