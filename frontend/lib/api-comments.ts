import { apiFetch } from "./api-client";
import type { CommentItem, CreateCommentDto } from "@stave/shared-types";

/**
 * UC-63 — Pinned comments API. File riêng cho module (quy tắc: không thêm
 * hàm vào `api-client.ts`); shape lấy đúng từ `@stave/shared-types` (mirror
 * của `CommentsService` phía backend).
 */

/** Giới hạn đồng bộ với DTO phía backend (`create-comment.dto.ts`). */
export const COMMENT_BODY_MAX_LENGTH = 1000;

/** GET /projects/:id/comments — danh sách phẳng, mới nhất đứng sau. */
export async function getComments(projectId: string): Promise<CommentItem[]> {
  return apiFetch<CommentItem[]>(`/projects/${projectId}/comments`);
}

/**
 * POST /projects/:id/comments. `parentId` khác null → trả lời 1 cấp, kế thừa
 * vị trí neo của bình luận gốc (backend tự điền, không cần gửi).
 */
export async function createComment(
  projectId: string,
  payload: CreateCommentDto,
): Promise<CommentItem> {
  return apiFetch<CommentItem>(`/projects/${projectId}/comments`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * DELETE /projects/:id/comments/:commentId — tác giả xoá được bình luận của
 * mình; owner xoá được mọi bình luận (BR-69). Lỗi 403 khi người xem (view)
 * cố xoá bình luận của người khác.
 */
export async function deleteComment(
  projectId: string,
  commentId: string,
): Promise<void> {
  await apiFetch<void>(
    `/projects/${projectId}/comments/${commentId}`,
    { method: "DELETE" },
  );
}
