import {
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import type { CreateSoundMappingDto } from './dto/create-mapping.dto';

export interface SoundMappingRow {
  id: string;
  owner_id: string;
  project_id: string;
  track_id: string;
  pitch: number;
  sound_id: string;
  created_at: string;
}

export interface SoundMappingWithSound extends SoundMappingRow {
  sound_name: string | null;
  sound_duration_sec: number | null;
  sound_playback_url: string | null;
}

@Injectable()
export class SoundMappingsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  /**
   * Kiểm tra user có quyền edit project không.
   * Khớp với logic trong audio-sketches.service.ts và custom-sounds.service.ts.
   */
  private async assertCanEditProject(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const { data: project, error } = await this.supabase
      .from('projects')
      .select('owner_id')
      .eq('id', projectId)
      .maybeSingle<{ owner_id: string }>();

    if (error) throw new InternalServerErrorException('Could not read project');
    if (!project) throw new NotFoundException('Project not found');
    if (project.owner_id === userId) return;

    const { data: collab } = await this.supabase
      .from('project_collaborators')
      .select('permission_level')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle<{ permission_level: string }>();

    if (collab?.permission_level === 'edit') return;

    throw new ForbiddenException('You do not have edit access to this project');
  }

  /**
   * UC-57 — tạo mapping từ track + pitch → custom sound.
   * Upsert: nếu (track_id, pitch) đã tồn tại → update sound_id.
   */
  async create(
    userId: string,
    dto: CreateSoundMappingDto,
  ): Promise<SoundMappingRow> {
    await this.assertCanEditProject(dto.projectId, userId);

    // Kiểm sound có tồn tại và thuộc về user
    const { data: sound, error: soundError } = await this.supabase
      .from('custom_sounds')
      .select('id')
      .eq('id', dto.soundId)
      .eq('owner_id', userId)
      .maybeSingle();

    if (soundError) throw new InternalServerErrorException('Could not verify sound');
    if (!sound) throw new NotFoundException('Custom sound not found');

    // Upsert mapping (track + pitch unique)
    const { data, error } = await this.supabase
      .from('sound_mappings')
      .upsert(
        {
          owner_id: userId,
          project_id: dto.projectId,
          track_id: dto.trackId,
          pitch: dto.pitch,
          sound_id: dto.soundId,
        },
        { onConflict: 'owner_id,track_id,pitch' },
      )
      .select('*')
      .single<SoundMappingRow>();

    if (error || !data) {
      throw new InternalServerErrorException('Could not create sound mapping');
    }

    return data;
  }

  /**
   * UC-57 — lấy tất cả mapping của 1 project.
   * Trả về kèm sound info (name, duration, playback_url).
   */
  async listByProject(
    userId: string,
    projectId: string,
  ): Promise<SoundMappingWithSound[]> {
    await this.assertCanEditProject(projectId, userId);

    const { data, error } = await this.supabase
      .from('sound_mappings')
      .select(
        `
        *,
        custom_sounds(name, duration_sec)
      `,
      )
      .eq('owner_id', userId)
      .eq('project_id', projectId)
      .order('track_id')
      .order('pitch')
      .returns<(SoundMappingRow & { custom_sounds: { name: string; duration_sec: number | null } | null })[]>();

    if (error) {
      throw new InternalServerErrorException('Could not list sound mappings');
    }

    return (data ?? []).map((row) => ({
      ...row,
      sound_name: row.custom_sounds?.name ?? null,
      sound_duration_sec: row.custom_sounds?.duration_sec ?? null,
      sound_playback_url: null, // frontend sẽ lấy từ custom_sounds endpoint
    }));
  }

  /**
   * UC-59 variant — xoá mapping.
   * Chỉ chủ sở hữu mapping mới xoá được.
   */
  async delete(userId: string, mappingId: string): Promise<void> {
    const { error } = await this.supabase
      .from('sound_mappings')
      .delete()
      .eq('id', mappingId)
      .eq('owner_id', userId);

    if (error) {
      throw new InternalServerErrorException('Could not delete sound mapping');
    }
  }

  /**
   * Xoá mapping theo track + pitch (dùng khi unassign sound).
   */
  async deleteByTrackPitch(
    userId: string,
    projectId: string,
    trackId: string,
    pitch: number,
  ): Promise<void> {
    await this.assertCanEditProject(projectId, userId);

    const { error } = await this.supabase
      .from('sound_mappings')
      .delete()
      .eq('owner_id', userId)
      .eq('project_id', projectId)
      .eq('track_id', trackId)
      .eq('pitch', pitch);

    if (error) {
      throw new InternalServerErrorException('Could not delete sound mapping');
    }
  }
}
