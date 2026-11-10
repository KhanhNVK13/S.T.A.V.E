import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CUSTOM_SOUND_QUOTA_KEY,
  PLATFORM_SETTING_CATALOG,
  needsReductionConfirmation,
  validateChanges,
} from '@stave/shared-types';
import type {
  PlatformSettingItem,
  PlatformSettingsResponse,
  SettingChange,
  SettingDef,
  SettingValue,
  UpdateSettingsResponse,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { PlatformSettingsService } from './platform-settings.service';
import type { UpdateSettingsDto } from './dto/update-settings.dto';

interface StoredRow {
  key: string;
  value: unknown;
}

/**
 * Hiểu giá trị lưu giống các nơi đọc thật: số, hoặc chuỗi số nguyên
 * (custom-sounds dùng `Number(value)`); boolean, hoặc chuỗi "true"/"false"
 * (trigger đăng ký và trang đăng ký chấp nhận "false").
 */
function readStoredValue(
  def: SettingDef,
  raw: unknown,
): SettingValue | undefined {
  if (def.type === 'boolean') {
    if (typeof raw === 'boolean') return raw;
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    return undefined;
  }
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && /^\d+$/.test(raw)) return Number(raw);
  return undefined;
}

@Injectable()
export class PlatformSettingsAdminService {
  private readonly logger = new Logger(PlatformSettingsAdminService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
    private readonly platformSettings: PlatformSettingsService,
  ) {}

  async getAll(): Promise<PlatformSettingsResponse> {
    const stored = await this.readStored(
      PLATFORM_SETTING_CATALOG.map((def) => def.key),
    );
    const groups: PlatformSettingsResponse['groups'] = [];
    for (const def of PLATFORM_SETTING_CATALOG) {
      const value = this.effectiveValue(def, stored);
      let group = groups.find((g) => g.group === def.group);
      if (!group) {
        group = { group: def.group, items: [] };
        groups.push(group);
      }
      const item: PlatformSettingItem = { ...def, value };
      group.items.push(item);
    }
    return { groups };
  }

  async update(
    adminId: string,
    dto: UpdateSettingsDto,
  ): Promise<UpdateSettingsResponse> {
    const validation = validateChanges(dto.changes);
    if (!validation.ok) {
      throw new BadRequestException({
        message: 'Invalid platform settings',
        errors: validation.errors,
      });
    }

    const stored = await this.readStored(validation.changes.map((c) => c.key));
    const changed: Array<{
      change: SettingChange;
      def: SettingDef;
      oldValue: SettingValue;
    }> = [];
    for (const change of validation.changes) {
      const def = PLATFORM_SETTING_CATALOG.find((d) => d.key === change.key);
      if (!def) continue;
      const hasRow = stored.has(change.key);
      const unchanged = hasRow
        ? stored.get(change.key) === change.value
        : change.value === def.default;
      if (unchanged) continue;
      changed.push({
        change,
        def,
        oldValue: this.effectiveValue(def, stored),
      });
    }

    if (changed.length === 0) return { updated: [] };

    const quota = changed.find((c) => c.change.key === CUSTOM_SOUND_QUOTA_KEY);
    if (quota && (quota.change.value as number) < (quota.oldValue as number)) {
      const maxUsageBytes = await this.readMaxUsageBytes();
      if (
        needsReductionConfirmation(
          CUSTOM_SOUND_QUOTA_KEY,
          quota.change.value as number,
          maxUsageBytes,
        ) &&
        dto.confirmReduction !== true
      ) {
        throw new ConflictException({
          message: 'Quota reduction requires confirmation',
          requiresConfirmation: true,
          maxUsageBytes,
        });
      }
    }

    const { error } = await this.supabase.from('platform_settings').upsert(
      changed.map(({ change }) => ({ key: change.key, value: change.value })),
      { onConflict: 'key' },
    );
    if (error) {
      this.logger.error(`Could not save platform settings: ${error.message}`);
      throw new InternalServerErrorException(
        'Could not save platform settings',
      );
    }

    for (const { change } of changed)
      this.platformSettings.invalidate(change.key);

    await this.writeAuditLog(
      adminId,
      changed.map(
        ({ change, oldValue }) =>
          `${change.key}: ${String(oldValue)} -> ${String(change.value)}`,
      ),
    );

    return { updated: changed.map(({ change }) => change.key) };
  }

  private async readStored(keys: string[]): Promise<Map<string, unknown>> {
    const { data, error } = await this.supabase
      .from('platform_settings')
      .select('key, value')
      .in('key', keys);
    if (error) {
      this.logger.error(`Could not read platform settings: ${error.message}`);
      throw new InternalServerErrorException(
        'Could not read platform settings',
      );
    }
    const map = new Map<string, unknown>();
    for (const row of (data ?? []) as StoredRow[]) {
      if (keys.includes(row.key)) map.set(row.key, row.value);
    }
    return map;
  }

  private effectiveValue(
    def: SettingDef,
    stored: Map<string, unknown>,
  ): SettingValue {
    return readStoredValue(def, stored.get(def.key)) ?? def.default;
  }

  private async readMaxUsageBytes(): Promise<number> {
    const { data, error } = await this.supabase.rpc(
      'admin_custom_sound_max_usage',
    );
    const value = Number(data);
    if (
      error ||
      data === null ||
      data === undefined ||
      !Number.isFinite(value)
    ) {
      this.logger.error(
        `Could not read custom sound max usage: ${error?.message ?? 'unexpected result'}`,
      );
      throw new InternalServerErrorException(
        'Could not check custom sound usage',
      );
    }
    return value;
  }

  private async writeAuditLog(
    adminId: string,
    reasons: string[],
  ): Promise<void> {
    const { error } = await this.supabase.from('admin_audit_log').insert(
      reasons.map((reason) => ({
        admin_id: adminId,
        action: 'settings.update',
        target_type: 'platform_setting',
        target_id: null,
        reason,
      })),
    );
    if (error) {
      this.logger.error(
        `Could not write audit entries settings.update (${reasons.join('; ')}): ${error.message}`,
      );
    }
  }
}
