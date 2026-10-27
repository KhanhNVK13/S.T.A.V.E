"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  PresenceUpdatePayload,
  PresenceUser,
} from "@stave/shared-types";
import { supabase } from "../../lib/supabase-browser";
import { getStoredSessionId } from "../../lib/api-client";
import { useAuth } from "../../context/auth-context";

/**
 * UC-64 — client side of the real-time presence gateway (`/collab`
 * namespace). Same two-layer auth as the HTTP API: the Supabase access
 * token + the STAVE business session id ride the socket handshake.
 *
 * BR-70: nothing here ever hits the database — the roster is what the
 * server broadcasts, and it lives only in the server's RAM.
 *
 * Failure behaviour (2.E1/2.E2): a brief disconnect shows a
 * "reconnecting" state; after the client gives up (5 attempts) the
 * connection is marked failed and the UI says to refresh the page. The
 * editor itself is unaffected either way.
 */

export type PresenceStatus =
  | "idle" // not signed in / nothing to connect to — show nothing
  | "connecting" // first handshake in flight
  | "connected"
  | "reconnecting" // dropped, socket.io retrying
  | "failed"; // gave up — page needs a refresh

export type BranchMovedInfo = {
  projectId: string;
  branchId: string;
  commitId: string;
  byUserId: string;
};

export interface UsePresenceOptions {
  /**
   * 4.1/BR-71: someone else moved a branch this room has open. The socket
   * event is `branch:moved`; the editor wires a fallback 20s poll too.
   */
  onBranchMoved?: (info: BranchMovedInfo) => void;
}

export interface UsePresenceResult {
  /** Everyone currently in the room (the caller is included). */
  users: PresenceUser[];
  status: PresenceStatus;
  /** Vietnamese status line for reconnecting/failed — null otherwise. */
  statusMessage: string | null;
  /**
   * UC-62 5.E1: my access was just revoked and every one of my tabs is
   * being kicked off the room. The parent must redirect to /projects.
   */
  accessRevoked: boolean;
}

/** Message shown while the socket retries after a drop (2.E1). */
export const PRESENCE_RECONNECTING_MESSAGE =
  "Mất kết nối thời gian thực. Đang thử kết nối lại…";
/** Message shown after the retries are exhausted (2.E2). */
export const PRESENCE_FAILED_MESSAGE =
  "Không thể kết nối đến máy chủ thời gian thực. Vui lòng làm mới trang.";

export function usePresence(
  projectId: string,
  options: UsePresenceOptions = {},
): UsePresenceResult {
  const { user } = useAuth();
  const myId = user?.id ?? null;

  /**
   * Roster is stored *with* the project it was broadcast for, so switching
   * to another project shows an empty stack immediately instead of the
   * previous project's people (no synchronous reset in the effect body —
   * same rule this codebase follows in `use-version-control.ts`).
   */
  const [roster, setRoster] = useState<PresenceUpdatePayload>({
    projectId,
    users: [],
  });
  const [status, setStatus] = useState<PresenceStatus>("idle");
  /** The project whose access was just revoked from me (5.E1), or null. */
  const [revokedProject, setRevokedProject] = useState<string | null>(null);

  const onBranchMovedRef = useRef<
    ((info: BranchMovedInfo) => void) | undefined
  >(undefined);

  useEffect(() => {
    onBranchMovedRef.current = options.onBranchMoved;
  }, [options.onBranchMoved]);

  useEffect(() => {
    if (!myId) return;

    let socket: Socket | null = null;
    let disposed = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (disposed) return;
      const accessToken = data.session?.access_token;
      const sessionId = getStoredSessionId();

      // 1.E1: nothing to authenticate with — stay idle, show nothing.
      if (!accessToken || !sessionId) {
        setStatus("idle");
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
      // The Socket.IO server lives on the Nest backend at the default
      // `/socket.io` transport; appending `/collab` targets the presence
      // namespace (socket.io-client reads the URL path as the namespace).
      // Reconnect bounds are set here (2.E2) so the namespace inherits them.
      const nsp = io(`${apiUrl}/collab`, {
        auth: { accessToken, sessionId },
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
      });
      socket = nsp;

      nsp.on("connect", () => {
        if (disposed) return;
        setStatus("connected");
        // (Re)join the room after a reconnect too.
        nsp.emit("presence:join", { projectId });
      });

      nsp.on("disconnect", () => {
        if (disposed) return;
        // socket.io will auto-retry; the UI shows the warning meanwhile.
        setStatus((prev) =>
          prev === "failed" ? prev : "reconnecting",
        );
      });

      nsp.on("reconnect_failed", () => {
        if (disposed) return;
        // Retries exhausted — stop retrying and surface the final state.
        setStatus("failed");
        nsp.disconnect();
      });

      nsp.on("connect_error", () => {
        // First-attempt failure — the "reconnecting" warning shows until
        // either the link recovers or the retries are exhausted (2.E1).
        if (!disposed) setStatus("reconnecting");
      });

      nsp.on(
        "presence:update",
        (payload: PresenceUpdatePayload) => {
          if (disposed || payload.projectId !== projectId) return;
          setRoster(payload);
        },
      );

      nsp.on(
        "branch:moved",
        (info: BranchMovedInfo) => {
          if (disposed) return;
          onBranchMovedRef.current?.(info);
        },
      );

      // UC-62 5.E1: the room's access was taken away from me (every one of
      // my tabs gets this before being force-disconnected).
      nsp.on(
        "collab:access_revoked",
        (payload: { projectId: string; userId: string }) => {
          if (disposed) return;
          if (payload.projectId === projectId && payload.userId === myId) {
            setRevokedProject(projectId);
          }
        },
      );

      setStatus("connecting");
      nsp.emit("presence:join", { projectId });
    })();

    return () => {
      disposed = true;
      if (socket) {
        socket.emit("presence:leave", { projectId });
        socket.disconnect();
      }
    };
  }, [projectId, myId]);

  return {
    users: roster.projectId === projectId ? roster.users : [],
    status,
    statusMessage:
      status === "reconnecting"
        ? PRESENCE_RECONNECTING_MESSAGE
        : status === "failed"
          ? PRESENCE_FAILED_MESSAGE
          : null,
    accessRevoked: revokedProject === projectId,
  };
}
