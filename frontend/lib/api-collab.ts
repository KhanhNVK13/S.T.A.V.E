import { apiFetch } from "./api-client";
import type {
  CollaboratorItem,
  CollaborationInvitation,
  CollaboratorPermissionLevel,
} from "@stave/shared-types";

/**
 * UC-60/61/62 — Collaboration API. Một file riêng cho module (quy tắc: không
 * thêm hàm vào `api-client.ts`); shape trả về lấy đúng từ
 * `@stave/shared-types` (mirror của `CollaborationService` phía backend).
 */

/** GET /projects/:id/collaborators — owner + cộng tác viên đã chấp nhận. */
export async function listCollaborators(projectId: string): Promise<CollaboratorItem[]> {
  return apiFetch<CollaboratorItem[]>(`/projects/${projectId}/collaborators`);
}

/**
 * POST /projects/:id/collaborators — chỉ owner. `identifier` là username (khớp
 * hoàn toàn) hoặc email (không phân biệt hoa thường). Trùng lời mời / đủ hạn /
 * không tìm thấy tài khoản → backend trả 409/404, xem qua `apiErrorMessage`.
 */
export async function inviteCollaborator(
  projectId: string,
  payload: { identifier: string; permissionLevel: CollaboratorPermissionLevel },
): Promise<CollaboratorItem> {
  return apiFetch<CollaboratorItem>(`/projects/${projectId}/collaborators`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * PATCH /projects/:id/collaborators/:collaboratorId — chỉ owner. Với người
 * đang `pending`, đổi mức quyền *sẽ cấp*, không cấp quyền thật (BR-65).
 */
export async function patchCollaboratorPermission(
  projectId: string,
  collaboratorId: string,
  permissionLevel: CollaboratorPermissionLevel,
): Promise<CollaboratorItem> {
  return apiFetch<CollaboratorItem>(
    `/projects/${projectId}/collaborators/${collaboratorId}`,
    {
      method: "PATCH",
      body: JSON.stringify({ permissionLevel }),
    },
  );
}

/**
 * DELETE /projects/:id/collaborators/:collaboratorId — chỉ owner. Với người đã
 * chấp nhận, commit/bình luận của họ vẫn được giữ (BR-67); với người đang
 * `pending` chỉ là rút lời mời, không gửi thông báo "bị gỡ".
 */
export async function removeCollaborator(
  projectId: string,
  collaboratorId: string,
): Promise<void> {
  await apiFetch<void>(
    `/projects/${projectId}/collaborators/${collaboratorId}`,
    { method: "DELETE" },
  );
}

// ── UC-60: lời mời gửi tới chính mình ───────────────────────────────

/** GET /users/me/collaboration-invitations — các lời mời đang chờ của tôi. */
export async function listMyInvitations(): Promise<CollaborationInvitation[]> {
  return apiFetch<CollaborationInvitation[]>("/users/me/collaboration-invitations");
}

/** POST /users/me/collaboration-invitations/:id/accept — chấp nhận, được cấp quyền. */
export async function acceptInvitation(invitationId: string): Promise<void> {
  await apiFetch<void>(`/users/me/collaboration-invitations/${invitationId}/accept`, {
    method: "POST",
  });
}

/** POST /users/me/collaboration-invitations/:id/decline — từ chối, xoá lời mời. */
export async function declineInvitation(invitationId: string): Promise<void> {
  await apiFetch<void>(`/users/me/collaboration-invitations/${invitationId}/decline`, {
    method: "POST",
  });
}
