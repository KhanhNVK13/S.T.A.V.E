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
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import {
  MAX_SOUND_DURATION_SEC,
  MAX_SOUND_SIZE_BYTES,
} from './dto/create-upload-url.dto';
import type { CustomSoundSource } from './dto/confirm-custom-sound.dto';
import { readWavInfo } from './wav-info';

export const CUSTOM_SOUNDS_BUCKET = 'custom-sounds';

const PLAYBACK_URL_TTL_SEC = 60 * 60;
const DEFAULT_QUOTA_BYTES = 50 * 1024 * 1024;
const QUOTA_SETTING_KEY = 'custom_sound_quota_bytes';
const DURATION_TOLERANCE_SEC = 0.05;
const UNIQUE_VIOLATION = '23505';

export interface CustomSoundRow {
  id: string;
  owner_id: string;
  name: string;
  file_url: string;
  duration_sec: number;
  size_bytes: number;
  source: CustomSoundSource;
  created_at: string;
  deleted_at: string | null;
}

export interface CustomSoundResponse {
  id: string;
  name: string;
  durationSec: number;
  sizeBytes: number;
  source: CustomSoundSource;
  createdAt: string;
  playbackUrl: string | null;
}

export interface ResolvedCustomSound {
  id: string;
  name: string | null;
  playable: boolean;
  reason: 'missing' | 'deleted' | null;
  playbackUrl: string | null;
}

export interface CustomSoundLibrary {
  items: CustomSoundResponse[];
  usedBytes: number;
  quotaBytes: number;
}

function cleanName(raw: string): string {
  return Array.from(raw)
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code > 0x1f && code !== 0x7f;
    })
    .join('')
    .trim();
}

@Injectable()
export class CustomSoundsService {
  private readonly logger = new Logger(CustomSoundsService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  private async loadViewableProject(
    projectId: string,
    userId: string,
  ): Promise<{ owner_id: string }> {
    const { data: project, error } = await this.supabase
      .from('projects')
      .select('owner_id, visibility')
      .eq('id', projectId)
      .maybeSingle<{ owner_id: string; visibility: string }>();

    if (error) throw new InternalServerErrorException('Could not read project');
    if (!project) throw new NotFoundException('Project not found');
    if (project.owner_id === userId || project.visibility === 'public') {
      return project;
    }

    const { data: collab } = await this.supabase
      .from('project_collaborators')
      .select('permission_level')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle<{ permission_level: string }>();
    if (collab) return project;

    throw new ForbiddenException('You do not have access to this project');
  }

  async resolveForProject(
    userId: string,
    projectId: string,
    ids: string[],
  ): Promise<ResolvedCustomSound[]> {
    const project = await this.loadViewableProject(projectId, userId);
    if (ids.length === 0) return [];

    const [{ data: rows, error }, { data: refs, error: refError }] =
      await Promise.all([
        this.supabase
          .from('custom_sounds')
          .select('*')
          .in('id', ids)
          .returns<CustomSoundRow[]>(),
        this.supabase
          .from('sound_mappings')
          .select('custom_sound_id')
          .eq('project_id', projectId)
          .in('custom_sound_id', ids)
          .returns<{ custom_sound_id: string }[]>(),
      ]);
    if (error || refError) {
      throw new InternalServerErrorException('Could not resolve custom sounds');
    }

    const referenced = new Set((refs ?? []).map((r) => r.custom_sound_id));
    const byId = new Map((rows ?? []).map((r) => [r.id, r]));

    return Promise.all(
      ids.map(async (id): Promise<ResolvedCustomSound> => {
        const row = byId.get(id);
        const visible = row && (row.owner_id === userId || referenced.has(id));
        if (!row || !visible) {
          return {
            id,
            name: null,
            playable: false,
            reason: 'missing',
            playbackUrl: null,
          };
        }
        if (row.deleted_at && row.owner_id === project.owner_id) {
          return {
            id,
            name: row.name,
            playable: false,
            reason: 'deleted',
            playbackUrl: null,
          };
        }
        return {
          id,
          name: row.name,
          playable: true,
          reason: null,
          playbackUrl: await this.signPlayback(row.file_url),
        };
      }),
    );
  }

  private pathFor(ownerId: string, soundId: string): string {
    return `${ownerId}/${soundId}.wav`;
  }

  async getQuotaBytes(): Promise<number> {
    const { data } = await this.supabase
      .from('platform_settings')
      .select('value')
      .eq('key', QUOTA_SETTING_KEY)
      .maybeSingle<{ value: unknown }>();
    const value = Number(data?.value);
    return Number.isFinite(value) && value > 0 ? value : DEFAULT_QUOTA_BYTES;
  }

  async getUsedBytes(ownerId: string): Promise<number> {
    const { data, error } = await this.supabase.rpc(
      'custom_sound_usage_bytes',
      { p_owner_id: ownerId },
    );
    if (error) {
      throw new InternalServerErrorException(
        'Could not read custom sound usage',
      );
    }
    return Number(data ?? 0);
  }

  private async assertWithinQuota(ownerId: string, extraBytes: number) {
    const [used, quota] = await Promise.all([
      this.getUsedBytes(ownerId),
      this.getQuotaBytes(),
    ]);
    if (used + extraBytes > quota) {
      throw new BadRequestException(
        `Thư viện âm thanh đã đầy (tối đa ${Math.round(quota / 1024 / 1024)}MB). Hãy xoá bớt âm thanh cũ rồi thử lại.`,
      );
    }
  }

  async createUploadUrl(
    ownerId: string,
    payload: { durationSec: number; sizeBytes: number },
  ): Promise<{ soundId: string; path: string; token: string }> {
    if (
      payload.durationSec > MAX_SOUND_DURATION_SEC ||
      payload.sizeBytes > MAX_SOUND_SIZE_BYTES
    ) {
      throw new BadRequestException('Âm thanh tối đa 30 giây và 10MB');
    }
    await this.assertWithinQuota(ownerId, payload.sizeBytes);

    const soundId = randomUUID();
    const path = this.pathFor(ownerId, soundId);
    const { data, error } = await this.supabase.storage
      .from(CUSTOM_SOUNDS_BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new InternalServerErrorException('Could not create upload URL');
    }
    return { soundId, path, token: data.token };
  }

  async confirmUpload(
    ownerId: string,
    payload: { soundId: string; name: string; source: CustomSoundSource },
  ): Promise<CustomSoundResponse> {
    const name = cleanName(payload.name);
    if (!name) {
      throw new BadRequestException('Tên âm thanh không được để trống');
    }

    const path = this.pathFor(ownerId, payload.soundId);
    const { data: blob, error: downloadError } = await this.supabase.storage
      .from(CUSTOM_SOUNDS_BUCKET)
      .download(path);
    if (downloadError || !blob) {
      throw new BadRequestException(
        'Chưa thấy file đã tải lên cho âm thanh này',
      );
    }

    const file = Buffer.from(await blob.arrayBuffer());
    const reject = async (message: string): Promise<never> => {
      await this.removeFiles([path]);
      throw new BadRequestException(message);
    };

    if (file.length > MAX_SOUND_SIZE_BYTES) {
      return reject('Âm thanh tối đa 10MB');
    }
    const info = readWavInfo(file);
    if (!info || info.durationSec <= 0) {
      return reject('File tải lên không phải âm thanh WAV hợp lệ');
    }
    if (info.durationSec > MAX_SOUND_DURATION_SEC + DURATION_TOLERANCE_SEC) {
      return reject('Âm thanh tối đa 30 giây');
    }

    try {
      await this.assertWithinQuota(ownerId, file.length);
    } catch (err) {
      await this.removeFiles([path]);
      throw err;
    }

    const durationSec =
      Math.round(Math.min(info.durationSec, MAX_SOUND_DURATION_SEC) * 1000) /
      1000;

    const { data, error } = await this.supabase
      .from('custom_sounds')
      .insert({
        id: payload.soundId,
        owner_id: ownerId,
        name,
        file_url: path,
        duration_sec: durationSec,
        size_bytes: file.length,
        source: payload.source,
      })
      .select('*')
      .single<CustomSoundRow>();

    if (error?.code === UNIQUE_VIOLATION) {
      throw new ConflictException('Âm thanh này đã được lưu');
    }
    if (error || !data) {
      this.logger.error(`Insert custom sound failed: ${error?.message}`);
      throw new InternalServerErrorException('Could not save custom sound');
    }

    return this.toResponse(data, await this.signPlayback(data.file_url));
  }

  async list(ownerId: string): Promise<CustomSoundLibrary> {
    const { data, error } = await this.supabase
      .from('custom_sounds')
      .select('*')
      .eq('owner_id', ownerId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .returns<CustomSoundRow[]>();

    if (error) {
      throw new InternalServerErrorException('Could not list custom sounds');
    }

    const rows = data ?? [];
    const [urls, quotaBytes] = await Promise.all([
      Promise.all(rows.map((r) => this.signPlayback(r.file_url))),
      this.getQuotaBytes(),
    ]);
    return {
      items: rows.map((row, i) => this.toResponse(row, urls[i])),
      usedBytes: rows.reduce((sum, r) => sum + Number(r.size_bytes), 0),
      quotaBytes,
    };
  }

  async getUsage(
    ownerId: string,
    soundId: string,
  ): Promise<{ externalProjectCount: number }> {
    const { data: sound } = await this.supabase
      .from('custom_sounds')
      .select('id')
      .eq('id', soundId)
      .eq('owner_id', ownerId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!sound) throw new NotFoundException('Custom sound not found');

    const { data, error } = await this.supabase.rpc(
      'custom_sound_external_project_count',
      { p_sound_id: soundId },
    );
    if (error) {
      throw new InternalServerErrorException(
        'Could not read custom sound usage',
      );
    }
    return { externalProjectCount: Number(data ?? 0) };
  }

  async delete(
    ownerId: string,
    soundId: string,
    mode: 'self' | 'hard',
  ): Promise<{ removed: boolean; affectedProjects: number }> {
    const { data, error } = await this.supabase.rpc('delete_custom_sound', {
      p_sound_id: soundId,
      p_owner_id: ownerId,
      p_hard: mode === 'hard',
    });
    if (error) {
      this.logger.error(`delete_custom_sound failed: ${error.message}`);
      throw new InternalServerErrorException('Could not delete custom sound');
    }

    const row = (
      data as
        | {
            removed: boolean;
            file_url: string | null;
            affected_projects: number;
          }[]
        | null
    )?.[0];
    if (!row) throw new NotFoundException('Custom sound not found');

    if (row.removed && row.file_url) await this.removeFiles([row.file_url]);
    await this.collectGarbage();

    return { removed: row.removed, affectedProjects: row.affected_projects };
  }

  async collectGarbage(): Promise<void> {
    const { data, error } = await this.supabase.rpc(
      'collect_custom_sound_garbage',
    );
    if (error) {
      this.logger.error(
        `collect_custom_sound_garbage failed: ${error.message}`,
      );
      return;
    }
    const paths = ((data ?? []) as { file_url: string }[])
      .map((r) => r.file_url)
      .filter(Boolean);
    await this.removeFiles(paths);
  }

  async removeAllFilesOf(ownerId: string): Promise<void> {
    const { data, error } = await this.supabase.storage
      .from(CUSTOM_SOUNDS_BUCKET)
      .list(ownerId, { limit: 1000 });
    if (error) {
      this.logger.error(`List custom sound files failed: ${error.message}`);
      return;
    }
    await this.removeFiles((data ?? []).map((f) => `${ownerId}/${f.name}`));
  }

  private async removeFiles(paths: string[]): Promise<void> {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await this.supabase.storage
        .from(CUSTOM_SOUNDS_BUCKET)
        .remove(chunk);
      if (error) {
        this.logger.error(`Remove custom sound files failed: ${error.message}`);
      }
    }
  }

  async signPlayback(path: string): Promise<string | null> {
    const { data } = await this.supabase.storage
      .from(CUSTOM_SOUNDS_BUCKET)
      .createSignedUrl(path, PLAYBACK_URL_TTL_SEC);
    return data?.signedUrl ?? null;
  }

  private toResponse(
    row: CustomSoundRow,
    playbackUrl: string | null,
  ): CustomSoundResponse {
    return {
      id: row.id,
      name: row.name,
      durationSec: Number(row.duration_sec),
      sizeBytes: Number(row.size_bytes),
      source: row.source,
      createdAt: row.created_at,
      playbackUrl,
    };
  }
}
