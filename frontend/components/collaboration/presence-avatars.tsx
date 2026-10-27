"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import type { PresenceUser } from "@stave/shared-types";
import { Avatar } from "../ui/avatar";
import { Toast } from "../ui/toast";
import { usePresence } from "./use-presence";

/**
 * UC-64 — the "who else is looking at this project right now" stack, used
 * on the editor's header bar. It is deliberately small: at most 4 avatars
 * overlapping, then a `+N` badge, each with a Vietnamese tooltip.
 *
 * Visibility rules:
 *   - 3.1: when nobody else is in the project, the whole widget is hidden
 *     (only the current user's own avatar would otherwise appear).
 *   - 2.E1/2.E2: while the socket reconnects or has failed, a yellow
 *     warning ring + icon replaces the calm state; the editor itself is
 *     unaffected either way.
 *   - BR-70: the roster comes from the server's in-memory room, so what
 *     shows here is exactly who the server thinks is open, nothing more.
 */

/** 2.E1/2.E2 — the message lines are produced by the hook; the tooltips
 *  surface them next to the avatars when the link is broken. */
const MAX_AVATARS = 4;

interface PresenceAvatarsProps {
  projectId: string;
  /** The current user's id (from AuthProvider) — used for the "(Bạn)" tag. */
  myId: string | null;
  /** 4.1/BR-71: a branch head moved while this room was open. */
  onBranchMoved?: (info: {
    projectId: string;
    branchId: string;
    commitId: string;
    byUserId: string;
  }) => void;
}

function avatarLabel(u: PresenceUser): string {
  return (
    u.displayName?.trim() || u.username?.trim() || u.id.slice(0, 4)
  );
}

/** Vietnamese tooltip for one avatar (spec IV.2). */
function tooltipFor(u: PresenceUser, myId: string | null): string {
  const name = u.displayName?.trim() || u.username?.trim() || "Người dùng";
  const handle = u.username ? ` (@${u.username})` : "";
  const self = myId && u.id === myId ? " (Bạn)" : "";
  return `${name}${handle}${self}`;
}

export function PresenceAvatars({
  projectId,
  myId,
  onBranchMoved,
}: PresenceAvatarsProps) {
  const { users, status, statusMessage, accessRevoked } = usePresence(
    projectId,
    { onBranchMoved },
  );

  const router = useRouter();

  // UC-62 5.E1: my access to this project was just revoked — the
  // widget stays mounted long enough to show the notice, then the editor
  // leaves to the project list. The notice is derived from `accessRevoked`
  // (no setState in the effect body); only the redirect schedules a timer.
  useEffect(() => {
    if (!accessRevoked) return;
    const t = setTimeout(() => router.replace("/projects"), 4000);
    return () => clearTimeout(t);
  }, [accessRevoked, router]);

  // 3.1 — nobody else in the project → render nothing at all.
  const others = users.filter((u) => u.id !== myId);
  if (
    others.length === 0 &&
    status !== "reconnecting" &&
    status !== "failed" &&
    !accessRevoked
  ) {
    return null;
  }

  const connecting = status === "connecting";
  const degraded = status === "reconnecting" || status === "failed";

  // Cap the visible avatars, keeping the rest behind a `+N`.
  const shown = others.slice(0, MAX_AVATARS);
  const overflow = Math.max(others.length - shown.length, 0);

  return (
    <div
      className="relative flex items-center"
      role="group"
      aria-label="Người đang xem dự án này"
    >
      {accessRevoked && (
        <Toast
          message="Quyền truy cập dự án của bạn đã kết thúc."
          variant="warning"
          onDismiss={() => router.replace("/projects")}
          duration={4000}
        />
      )}
      {degraded && statusMessage && (
        <span
          className="mr-1 flex items-center text-warning"
          title={statusMessage}
          aria-label={statusMessage}
        >
          <TriangleAlert size={14} />
        </span>
      )}

      {connecting ? (
        // Loading — a faint pulsing skeleton while the socket handshakes.
        <div className="flex items-center" aria-hidden>
          {[0, 1].map((i) => (
            <span
              key={i}
              className="h-5 w-5 animate-pulse rounded-full bg-surface-muted opacity-60"
              style={{ marginLeft: i === 0 ? 0 : -8 }}
            />
          ))}
        </div>
      ) : (
        <>
          {shown.map((u, i) => (
            <span
              key={u.id}
              className="relative inline-flex"
              title={tooltipFor(u, myId)}
              style={{ marginLeft: i === 0 ? 0 : -8 }}
            >
              <Avatar
                id={u.id}
                label={avatarLabel(u)}
                imageUrl={u.avatarUrl}
                size="sm"
              />
              {degraded && (
                <span
                  className="absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-surface bg-warning"
                  style={{ width: 10, height: 10 }}
                  aria-hidden
                />
              )}
            </span>
          ))}

          {overflow > 0 && (
            <span
              className="inline-flex items-center justify-center rounded-full border border-border bg-surface-muted text-[10px] font-semibold text-muted"
              title={`Và ${overflow} người khác đang cùng xem dự án`}
              aria-label={`Và ${overflow} người khác đang cùng xem dự án`}
              style={{ width: 20, height: 20, marginLeft: -8 }}
            >
              +{overflow}
            </span>
          )}
        </>
      )}
    </div>
  );
}
