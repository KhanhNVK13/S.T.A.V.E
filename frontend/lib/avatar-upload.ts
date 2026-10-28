import {
  confirmAvatar,
  createAvatarUploadUrl,
  type AvatarContentType,
} from "./api-client";
import { supabase } from "./supabase-browser";

export const AVATAR_MAX_SOURCE_BYTES = 10 * 1024 * 1024;
export const AVATAR_SIZE_PX = 256;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function validateAvatarFile(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Ảnh đại diện chỉ nhận file JPG, PNG hoặc WebP.";
  if (file.size > AVATAR_MAX_SOURCE_BYTES) return "Ảnh lớn hơn 10 MB nên không dùng được. Hãy chọn ảnh nhỏ hơn.";
  return null;
}

async function toSquareBlob(file: File): Promise<{ blob: Blob; contentType: AvatarContentType }> {
  const bitmap = await createImageBitmap(file);
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = AVATAR_SIZE_PX;
    canvas.height = AVATAR_SIZE_PX;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no-canvas");
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE_PX,
      AVATAR_SIZE_PX,
    );
    for (const type of ["image/webp", "image/jpeg"] as const) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));
      if (blob && blob.type === type) return { blob, contentType: type };
    }
    throw new Error("encode-failed");
  } finally {
    bitmap.close();
  }
}

export async function uploadAvatar(file: File): Promise<string | null> {
  const { blob, contentType } = await toSquareBlob(file);
  const { path, token } = await createAvatarUploadUrl(contentType);
  const { error } = await supabase.storage
    .from("avatars")
    .uploadToSignedUrl(path, token, blob, { contentType });
  if (error) throw new Error("upload-failed");
  const saved = await confirmAvatar(path);
  return saved.avatar_url;
}
