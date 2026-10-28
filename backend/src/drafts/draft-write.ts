import { ConflictException } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';

export function draftStaleError(): ConflictException {
  return new ConflictException({
    message: 'Draft was changed elsewhere',
    code: 'DRAFT_STALE',
  });
}

/**
 * Ghi nháp của một người trên một nhánh, có khoá lạc quan theo `updated_at`.
 * `expectedVersion`: bỏ trống = ghi đè không kiểm tra; `none` = chỉ chèn khi
 * chưa có dòng nháp; giá trị khác = chỉ cập nhật dòng còn đúng phiên bản đó.
 * Lệch thì ném 409 `DRAFT_STALE`. Trả về phiên bản mới.
 */
export async function writeDraft(
  supabase: SupabaseClient,
  params: {
    branchId: string;
    userId: string;
    snapshot: unknown;
    expectedVersion?: string;
  },
  onError: (message: string) => Error,
): Promise<string> {
  const { branchId, userId, snapshot, expectedVersion } = params;
  const updatedAt = new Date().toISOString();

  if (expectedVersion === undefined) {
    const { data, error } = await supabase
      .from('drafts')
      .upsert(
        {
          branch_id: branchId,
          user_id: userId,
          snapshot,
          updated_at: updatedAt,
        },
        { onConflict: 'branch_id,user_id' },
      )
      .select('updated_at')
      .single<{ updated_at: string }>();
    if (error || !data) throw onError(error?.message ?? 'no row returned');
    return data.updated_at;
  }

  if (expectedVersion === 'none') {
    const { data, error } = await supabase
      .from('drafts')
      .insert({
        branch_id: branchId,
        user_id: userId,
        snapshot,
        updated_at: updatedAt,
      })
      .select('updated_at')
      .single<{ updated_at: string }>();
    if (error?.code === '23505') throw draftStaleError();
    if (error || !data) throw onError(error?.message ?? 'no row returned');
    return data.updated_at;
  }

  const { data, error } = await supabase
    .from('drafts')
    .update({ snapshot, updated_at: updatedAt })
    .eq('branch_id', branchId)
    .eq('user_id', userId)
    .eq('updated_at', expectedVersion)
    .select('updated_at')
    .maybeSingle<{ updated_at: string }>();
  if (error) throw onError(error.message);
  if (!data) throw draftStaleError();
  return data.updated_at;
}
