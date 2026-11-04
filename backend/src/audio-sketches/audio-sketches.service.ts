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
  MAX_SKETCH_DURATION_SEC,
  MAX_SKETCH_SIZE_BYTES,
  type CreateUploadUrlDto,
} from './dto/create-upload-url.dto';
import type { AttachSketchDto } from './dto/attach-sketch.dto';
import {
  listStorageFiles,
  listStorageFolder,
  removeStorageFiles,
} from '../common/utils/storage-cleanup.util';

/** Bucket private; đường dẫn quy ước `{project_id}/{sketch_id}.wav`. */
const BUCKET = 'audio-sketches';

/** Thời hạn link nghe lại. Đủ dài để nghe hết 1 sketch, đủ ngắn để link rò ra ngoài cũng chóng hết hạn. */
const PLAYBACK_URL_TTL_SEC = 60 * 60;

/** File chưa gắn vào sketch nào quá lâu thì coi là mồ côi (upload bỏ dở). */
const UNATTACHED_UPLOAD_MAX_AGE_MS = 60 * 60 * 1000;
const SKETCH_FILE_PATTERN = /^[0-9a-f-]{36}\.wav$/i;
const REFERENCE_LOOKUP_CHUNK = 100;

/** 1 dòng của bảng `audio_sketches` (cột thật, đã tra information_schema). */
export interface AudioSketchRow {
  id: string;
  project_id: string;
  created_by: string;
  name: string;
  file_url: string;
  duration_sec: number;
  size_bytes: number;
  trim_start_sec: number;
  trim_end_sec: number | null;
  created_at: string;
}

/** Sketch trả về cho client, kèm link nghe có thời hạn. */
export interface AudioSketchResponse extends AudioSketchRow {
  playbackUrl: string | null;
}

@Injectable()
export class AudioSketchesService {
  private readonly logger = new Logger(AudioSketchesService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  /**
   * BR-26 — chỉ chủ dự án hoặc collaborator có quyền `edit` được thêm/xoá
   * sketch. Backend dùng `service_role` (bỏ qua RLS) nên phải tự kiểm; logic ở
   * đây cố ý khớp với hàm `public.can_edit_project()` mà RLS đang dùng, để 2
   * tầng không nói hai điều khác nhau.
   */
  private async assertCanEdit(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const { data: project, error } = await this.supabase
      .from('projects')
      .select('owner_id, archived_at')
      .eq('id', projectId)
      .maybeSingle<{ owner_id: string; archived_at: string | null }>();

    if (error) throw new InternalServerErrorException('Could not read project');
    if (!project) throw new NotFoundException('Project not found');
    if (project.archived_at) {
      throw new ConflictException(
        'Archived projects are read-only. Restore the project first',
      );
    }
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

  /** Ai xem được project thì nghe được sketch — khớp `public.can_view_project()`. */
  private async assertCanView(
    projectId: string,
    userId: string,
  ): Promise<void> {
    const { data: project, error } = await this.supabase
      .from('projects')
      .select('owner_id, visibility')
      .eq('id', projectId)
      .maybeSingle<{ owner_id: string; visibility: string }>();

    if (error) throw new InternalServerErrorException('Could not read project');
    if (!project) throw new NotFoundException('Project not found');
    if (project.owner_id === userId || project.visibility === 'public') return;

    const { data: collab } = await this.supabase
      .from('project_collaborators')
      .select('permission_level')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle<{ permission_level: string }>();

    if (collab) return;

    throw new ForbiddenException('You do not have access to this project');
  }

  /**
   * UC-55 bước 4 (phần xin quyền ghi) — cấp signed URL để **trình duyệt upload
   * thẳng lên Supabase Storage**, file không đi qua backend (quyết định kiến
   * trúc đã chốt: xem PROJECT_STATE §31).
   *
   * Kiểm BR-56 **trước khi** cấp URL để client khỏi tải lên hàng chục MB rồi
   * mới bị từ chối. Kiểm lại ở tầng service (không chỉ dựa vào decorator của
   * DTO) để quy tắc nghiệp vụ vẫn còn hiệu lực nếu sau này service được gọi từ
   * nơi khác không đi qua ValidationPipe. Bucket còn `file_size_limit` 20MB
   * làm lớp chặn cuối ở tầng Storage.
   */
  async createUploadUrl(
    projectId: string,
    userId: string,
    dto: CreateUploadUrlDto,
  ): Promise<{ sketchId: string; path: string; token: string }> {
    await this.assertCanEdit(projectId, userId);

    if (
      dto.durationSec > MAX_SKETCH_DURATION_SEC ||
      dto.sizeBytes > MAX_SKETCH_SIZE_BYTES
    ) {
      throw new BadRequestException('Audio sketch tối đa 3 phút và 20MB');
    }

    await this.removeStaleUnattachedUploads(projectId);

    const sketchId = randomUUID();
    const path = `${projectId}/${sketchId}.wav`;

    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new InternalServerErrorException('Could not create upload URL');
    }

    return { sketchId, path, token: data.token };
  }

  /**
   * Xin URL mà không bao giờ gọi attach để lại file mồ côi. Storage không ghi
   * ai đã upload nên chỉ dọn theo project: file `{uuid}.wav` quá 1 giờ và không
   * có dòng `audio_sketches` nào trỏ tới. Lỗi dọn dẹp không chặn việc cấp URL.
   */
  private async removeStaleUnattachedUploads(projectId: string): Promise<void> {
    try {
      const files = await listStorageFiles(this.supabase, BUCKET, projectId);
      const cutoff = Date.now() - UNATTACHED_UPLOAD_MAX_AGE_MS;
      const stale = files
        .filter((file) => {
          const createdAt = file.createdAt ? Date.parse(file.createdAt) : NaN;
          return SKETCH_FILE_PATTERN.test(file.name) && createdAt < cutoff;
        })
        .map((file) => `${projectId}/${file.name}`);

      const referenced = new Set<string>();
      for (let i = 0; i < stale.length; i += REFERENCE_LOOKUP_CHUNK) {
        const { data, error } = await this.supabase
          .from('audio_sketches')
          .select('file_url')
          .eq('project_id', projectId)
          .in('file_url', stale.slice(i, i + REFERENCE_LOOKUP_CHUNK))
          .returns<{ file_url: string }[]>();
        if (error) throw new Error(error.message);
        (data ?? []).forEach((row) => referenced.add(row.file_url));
      }

      const orphans = stale.filter((path) => !referenced.has(path));
      if (orphans.length === 0) return;
      await removeStorageFiles(this.supabase, BUCKET, orphans, this.logger);
    } catch (err) {
      this.logger.error(
        `Could not clean unattached audio sketch uploads of project ${projectId}: ${String(err)}`,
      );
    }
  }

  /**
   * UC-55 bước 4-5 — ghi sketch vào project SAU KHI client upload xong.
   *
   * Bắt buộc kiểm file có thật trong bucket trước khi insert: nếu không, client
   * gọi thẳng endpoint này là tạo được bản ghi trỏ tới file không tồn tại.
   */
  async attach(
    projectId: string,
    userId: string,
    dto: AttachSketchDto,
  ): Promise<AudioSketchResponse> {
    await this.assertCanEdit(projectId, userId);

    if (
      dto.trimEndSec !== undefined &&
      dto.trimStartSec !== undefined &&
      dto.trimEndSec <= dto.trimStartSec
    ) {
      throw new BadRequestException('Điểm cắt kết thúc phải sau điểm bắt đầu');
    }
    if (dto.trimEndSec !== undefined && dto.trimEndSec > dto.durationSec) {
      throw new BadRequestException('Điểm cắt vượt quá độ dài bản ghi');
    }

    const fileName = `${dto.sketchId}.wav`;
    const path = `${projectId}/${fileName}`;

    const { data: found, error: listError } = await this.supabase.storage
      .from(BUCKET)
      .list(projectId, { search: fileName, limit: 1 });

    if (listError) {
      throw new InternalServerErrorException('Could not verify uploaded file');
    }
    if (!found?.some((f) => f.name === fileName)) {
      throw new BadRequestException('Chưa thấy file đã tải lên cho sketch này');
    }

    const { data, error } = await this.supabase
      .from('audio_sketches')
      .insert({
        id: dto.sketchId,
        project_id: projectId,
        created_by: userId,
        name: dto.name,
        file_url: path,
        duration_sec: dto.durationSec,
        size_bytes: dto.sizeBytes,
        trim_start_sec: dto.trimStartSec ?? 0,
        trim_end_sec: dto.trimEndSec ?? null,
      })
      .select('*')
      .single<AudioSketchRow>();

    if (error || !data) {
      throw new InternalServerErrorException('Could not save audio sketch');
    }

    return { ...data, playbackUrl: await this.signPlayback(data.file_url) };
  }

  /** UC-55 POST-2 — danh sách sketch của project, kèm link nghe có thời hạn. */
  async list(
    projectId: string,
    userId: string,
  ): Promise<AudioSketchResponse[]> {
    await this.assertCanView(projectId, userId);

    const { data, error } = await this.supabase
      .from('audio_sketches')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .returns<AudioSketchRow[]>();

    if (error) {
      throw new InternalServerErrorException('Could not list audio sketches');
    }

    const rows = data ?? [];
    const urls = await Promise.all(
      rows.map((r) => this.signPlayback(r.file_url)),
    );
    return rows.map((row, i) => ({ ...row, playbackUrl: urls[i] }));
  }

  async remove(
    projectId: string,
    sketchId: string,
    userId: string,
  ): Promise<void> {
    await this.assertCanEdit(projectId, userId);

    const { data: sketch, error: readError } = await this.supabase
      .from('audio_sketches')
      .select('*')
      .eq('id', sketchId)
      .eq('project_id', projectId)
      .maybeSingle<AudioSketchRow>();

    if (readError) {
      throw new InternalServerErrorException('Could not read audio sketch');
    }
    if (!sketch) throw new NotFoundException('Audio sketch not found');

    const { error: deleteError } = await this.supabase
      .from('audio_sketches')
      .delete()
      .eq('id', sketchId)
      .eq('project_id', projectId);

    if (deleteError) {
      throw new InternalServerErrorException('Could not delete audio sketch');
    }

    const { error: storageError } = await this.supabase.storage
      .from(BUCKET)
      .remove([sketch.file_url]);

    if (storageError) {
      const { error: restoreError } = await this.supabase
        .from('audio_sketches')
        .insert(sketch);
      if (restoreError) {
        this.logger.error(
          `Could not restore audio sketch ${sketchId}: ${restoreError.message}`,
        );
      }
      throw new InternalServerErrorException('Could not delete audio sketch');
    }
  }

  async purgeProjectFiles(projectIds: string[]): Promise<void> {
    for (const projectId of projectIds) {
      try {
        const names = await listStorageFolder(this.supabase, BUCKET, projectId);
        await removeStorageFiles(
          this.supabase,
          BUCKET,
          names.map((name) => `${projectId}/${name}`),
          this.logger,
        );
      } catch (err) {
        this.logger.error(
          `Could not list audio sketch files of project ${projectId}, files may be orphaned: ${String(err)}`,
        );
      }
    }
  }

  /** Bucket là private nên mọi lần nghe đều cần link ký lại. */
  private async signPlayback(path: string): Promise<string | null> {
    const { data } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, PLAYBACK_URL_TTL_SEC);
    return data?.signedUrl ?? null;
  }
}
