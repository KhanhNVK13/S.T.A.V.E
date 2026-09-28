import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import {
  MAX_SOUND_DURATION_SEC,
  MAX_SOUND_SIZE_BYTES,
} from './dto/create-upload-url.dto';

/** Bucket private; đường dẫn quy ước `{userId}/{soundId}.{ext}`. */
const BUCKET = 'custom-sounds';

/** Thời hạn link nghe lại. Đủ dài để nghe hết sound, đủ ngắn để link rò ra ngoài cũng chóng hết hạn. */
const PLAYBACK_URL_TTL_SEC = 60 * 60;

/** 1 dòng của bảng `custom_sounds` (cột thật, cần tạo trên Supabase). */
export interface CustomSoundRow {
  id: string;
  owner_id: string;
  name: string;
  original_filename: string | null;
  duration_sec: number;
  size_bytes: number;
  storage_path: string;
  mime_type: string | null;
  created_at: string;
}

/** Sound trả về cho client, kèm link nghe có thời hạn. */
export interface CustomSoundResponse extends CustomSoundRow {
  playbackUrl: string | null;
}

@Injectable()
export class CustomSoundsService {
  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  /**
   * UC-56 bước 1-2 — cấp signed URL để trình duyệt upload thẳng lên
   * Supabase Storage, file không đi qua backend.
   *
   * Kiểm BR-60 (≤30s, ≤10MB) trước khi cấp URL để client khỏi tải lên
   * hàng chục MB rồi mới bị từ chối.
   */
  async createUploadUrl(
    userId: string,
    payload: {
      durationSec: number;
      sizeBytes: number;
      name: string;
      mimeType: string;
    },
  ): Promise<{ soundId: string; path: string; token: string }> {
    if (
      payload.durationSec > MAX_SOUND_DURATION_SEC ||
      payload.sizeBytes > MAX_SOUND_SIZE_BYTES
    ) {
      throw new BadRequestException(
        `Custom sound tối đa ${MAX_SOUND_DURATION_SEC} giây và ${MAX_SOUND_SIZE_BYTES / 1024 / 1024}MB (BR-60)`,
      );
    }

    const soundId = randomUUID();
    // Lấy extension từ mimeType
    const ext = mimeTypeToExt(payload.mimeType) || 'bin';
    const path = `${userId}/${soundId}.${ext}`;

    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (error || !data) {
      throw new InternalServerErrorException('Could not create upload URL');
    }

    return { soundId, path, token: data.token };
  }

  /**
   * UC-56 bước 3 — ghi sound sau khi client upload xong.
   *
   * Bắt buộc kiểm file có thật trong bucket trước khi insert: nếu không, client
   * gọi thẳng endpoint này là tạo được bản ghi trỏ tới file không tồn tại.
   */
  async confirmUpload(
    userId: string,
    payload: {
      soundId: string;
      name: string;
      originalFilename: string;
      durationSec: number;
      sizeBytes: number;
      mimeType: string;
    },
  ): Promise<CustomSoundResponse> {
    if (
      payload.durationSec > MAX_SOUND_DURATION_SEC ||
      payload.sizeBytes > MAX_SOUND_SIZE_BYTES
    ) {
      throw new BadRequestException(
        `Custom sound tối đa ${MAX_SOUND_DURATION_SEC} giây và ${MAX_SOUND_SIZE_BYTES / 1024 / 1024}MB (BR-60)`,
      );
    }

    const ext = mimeTypeToExt(payload.mimeType) || 'bin';
    const storagePath = `${userId}/${payload.soundId}.${ext}`;

    // Verify file exists in bucket
    const { data: found, error: listError } = await this.supabase.storage
      .from(BUCKET)
      .list(userId, { search: `${payload.soundId}.${ext}`, limit: 1 });

    if (listError) {
      throw new InternalServerErrorException('Could not verify uploaded file');
    }
    if (!found?.some((f) => f.name === `${payload.soundId}.${ext}`)) {
      throw new BadRequestException('Chưa thấy file đã tải lên cho sound này');
    }

    const { data, error } = await this.supabase
      .from('custom_sounds')
      .insert({
        id: payload.soundId,
        owner_id: userId,
        name: payload.name,
        original_filename: payload.originalFilename,
        duration_sec: payload.durationSec,
        size_bytes: payload.sizeBytes,
        storage_path: storagePath,
        mime_type: payload.mimeType,
      })
      .select('*')
      .single<CustomSoundRow>();

    if (error || !data) {
      throw new InternalServerErrorException('Could not save custom sound');
    }

    return { ...data, playbackUrl: await this.signPlayback(data.storage_path) };
  }

  /** UC-58 — danh sách sound của user hiện tại, kèm link nghe có thời hạn. */
  async list(userId: string): Promise<CustomSoundResponse[]> {
    const { data, error } = await this.supabase
      .from('custom_sounds')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false })
      .returns<CustomSoundRow[]>();

    if (error) {
      throw new InternalServerErrorException('Could not list custom sounds');
    }

    const rows = data ?? [];
    const urls = await Promise.all(
      rows.map((r) => this.signPlayback(r.storage_path)),
    );
    return rows.map((row, i) => ({ ...row, playbackUrl: urls[i] }));
  }

  /** UC-59 — xoá sound (chỉ chủ sở hữu). */
  async delete(userId: string, soundId: string): Promise<void> {
    // Lấy sound trước để biết storage_path cần xoá
    const { data: sound, error: fetchError } = await this.supabase
      .from('custom_sounds')
      .select('storage_path')
      .eq('id', soundId)
      .eq('owner_id', userId)
      .maybeSingle<{ storage_path: string }>();

    if (fetchError) {
      throw new InternalServerErrorException('Could not find custom sound');
    }
    if (!sound) {
      throw new NotFoundException('Custom sound not found');
    }

    // Xoá file trong storage
    const { error: storageError } = await this.supabase.storage
      .from(BUCKET)
      .remove([sound.storage_path]);

    if (storageError) {
      // Log nhưng không chặn — row đã mất thì file cũng không dùng được
      console.error('Failed to delete sound file:', storageError);
    }

    // Xoá row trong database
    const { error: deleteError } = await this.supabase
      .from('custom_sounds')
      .delete()
      .eq('id', soundId)
      .eq('owner_id', userId);

    if (deleteError) {
      throw new InternalServerErrorException('Could not delete custom sound');
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

/** Chuyển mimeType thành extension đơn giản. */
function mimeTypeToExt(mimeType: string): string | null {
  const map: Record<string, string> = {
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/mp3': 'mp3',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/webm': 'webm',
    'audio/webm;codecs=opus': 'webm',
  };
  return map[mimeType] ?? null;
}
