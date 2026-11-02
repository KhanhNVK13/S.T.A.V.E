"use client";

import type { JamParticipant } from "@stave/shared-types";
import { Avatar } from "../ui/avatar";

/**
 * UC-66 — the stack of avatars of who is in the jam room right now.
 * Mirrors the `presence-avatars` shape: at most 4 overlapping, then a `+N`
 * badge, each with a Vietnamese tooltip (display name / @username). The
 * caller is included; a "(Bạn)" tag marks their own avatar.
 */

const MAX_AVATARS = 4;

function label(p: JamParticipant): string {
  return p.displayName?.trim() || p.username?.trim() || p.userId.slice(0, 4);
}

function tooltip(p: JamParticipant, myId: string | null): string {
  const name = p.displayName?.trim() || p.username?.trim() || "Người dùng";
  const handle = p.username ? ` (@${p.username})` : "";
  const self = myId && p.userId === myId ? " (Bạn)" : "";
  return `${name}${handle}${self}`;
}

export function JamParticipantsBar({
  participants,
  myId,
}: {
  participants: JamParticipant[];
  myId: string | null;
}) {
  const shown = participants.slice(0, MAX_AVATARS);
  const overflow = Math.max(participants.length - shown.length, 0);

  if (participants.length === 0) {
    return (
      <span className="text-sm text-muted">Chưa có ai trong phòng.</span>
    );
  }

  return (
    <div
      className="flex items-center"
      role="group"
      aria-label="Người đang trong phòng Jam"
    >
      {shown.map((p, i) => (
        <span
          key={p.socketId}
          className="relative inline-flex"
          title={tooltip(p, myId)}
          style={{ marginLeft: i === 0 ? 0 : -8 }}
        >
          <Avatar id={p.userId} label={label(p)} imageUrl={p.avatarUrl} size="sm" />
        </span>
      ))}

      {overflow > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full border border-border bg-surface-muted text-[10px] font-semibold text-muted"
          title={`Và ${overflow} người khác đang trong phòng`}
          aria-label={`Và ${overflow} người khác đang trong phòng`}
          style={{ width: 20, height: 20, marginLeft: -8 }}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
