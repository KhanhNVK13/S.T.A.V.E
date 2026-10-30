"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  JamActivityItem,
  JamErrorPayload,
  JamParticipant,
  JamStatePayload,
  JamUserJoinedPayload,
  JamUserLeftPayload,
} from "@stave/shared-types";
import { supabase } from "../../lib/supabase-browser";
import { getStoredSessionId } from "../../lib/api-client";

/**
 * UC-66 — client side of the live Community Jam room (`/jam` namespace).
 * Mirrors the two-layer handshake auth of `use-presence` (the Supabase access
 * token + the STAVE business session ride the socket handshake).
 *
 * State is what the server broadcasts (the snapshot lives in the server's
 * RAM, BR-75). The client keeps `participants` and `activity` locally and
 * applies `jam:edit_applied` (UC-67) as it arrives; the read-only UI for
 * UC-66 simply renders the snapshot it already has.
 *
 * Failure behaviour (3.E1 / 4.E1): a brief drop shows a reconnecting flag
 * (the yellow banner); after the retries are exhausted the room is marked
 * failed and the UI offers "Thử lại".
 */

export type JamSocketStatus =
  | "idle" // not signed in / nothing to connect to
  | "connecting" // first handshake in flight
  | "connected"
  | "reconnecting" // dropped, socket.io retrying
  | "failed"; // gave up — needs a manual retry

export interface UseJamSocketResult {
  status: JamSocketStatus;
  /** The snapshot we are currently rendering (null until first `jam:state`). */
  state: JamStatePayload | null;
  participants: JamParticipant[];
  activity: JamActivityItem[];
  /** The last `jam:error` from the server, if any join was rejected. */
  joinError: JamErrorPayload | null;
  /** 4.E1 — the socket dropped; the room shows the reconnect banner. */
  isReconnecting: boolean;
  /** Retries were exhausted — the "Thử lại" action is offered. */
  failed: boolean;
  /** Re-emit `jam:join` after a failure. */
  retry: () => void;
}

export function useJamSocket(eventId: string | null): UseJamSocketResult {
  const [status, setStatus] = useState<JamSocketStatus>("idle");
  const [state, setState] = useState<JamStatePayload | null>(null);
  const [participants, setParticipants] = useState<JamParticipant[]>([]);
  const [activity, setActivity] = useState<JamActivityItem[]>([]);
  const [joinError, setJoinError] = useState<JamErrorPayload | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  const socketRef = useRef<Socket | null>(null);

  const join = useCallback((nsp: Socket) => {
    if (!eventId) return;
    setJoinError(null);
    nsp.emit("jam:join", { eventId });
  }, [eventId]);

  useEffect(() => {
    if (!eventId) return;

    let socket: Socket | null = null;
    let disposed = false;

    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (disposed) return;
      const accessToken = data.session?.access_token;
      const sessionId = getStoredSessionId();

      // 1.E1: nothing to authenticate with — stay idle.
      if (!accessToken || !sessionId) {
        setStatus("idle");
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "");
      const nsp = io(`${apiUrl}/jam`, {
        auth: { accessToken, sessionId },
        reconnectionAttempts: 5,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 10000,
        timeout: 10000,
      });
      socket = nsp;
      socketRef.current = nsp;

      nsp.on("connect", () => {
        if (disposed) return;
        setStatus("connected");
        join(nsp);
      });

      nsp.on("disconnect", () => {
        if (disposed) return;
        // socket.io auto-retries; the banner shows meanwhile (4.E1).
        setStatus((prev) => (prev === "failed" ? prev : "reconnecting"));
      });

      nsp.on("reconnect", () => {
        if (disposed) return;
        setStatus("connected");
        // Re-join the room after a reconnect too.
        join(nsp);
      });

      nsp.on("reconnect_failed", () => {
        if (disposed) return;
        setStatus("failed");
        nsp.disconnect();
      });

      nsp.on("connect_error", () => {
        if (!disposed) setStatus("reconnecting");
      });

      nsp.on("jam:state", (payload: JamStatePayload) => {
        if (disposed) return;
        setState(payload);
        setParticipants(payload.participants);
        setActivity(payload.activity);
      });

      nsp.on("jam:user_joined", (payload: JamUserJoinedPayload) => {
        if (disposed) return;
        setParticipants((prev) => {
          // Replace by socket so a rejoin of the same user collapses to one.
          const withoutSocket = prev.filter((p) => p.socketId !== payload.user.socketId);
          return [...withoutSocket, payload.user];
        });
      });

      nsp.on("jam:user_left", (payload: JamUserLeftPayload) => {
        if (disposed) return;
        setParticipants((prev) => prev.filter((p) => p.userId !== payload.userId));
      });

      nsp.on("jam:error", (payload: JamErrorPayload) => {
        if (disposed) return;
        setJoinError(payload);
        setStatus("failed");
      });

      setStatus("connecting");
      join(nsp);
    })();

    return () => {
      disposed = true;
      if (socket) {
        socket.emit("jam:leave");
        socket.disconnect();
        socketRef.current = null;
      }
      setState(null);
      setParticipants([]);
      setActivity([]);
      setJoinError(null);
      setStatus("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, retryNonce]);

  const retry = useCallback(() => {
    setJoinError(null);
    setRetryNonce((n) => n + 1);
  }, []);

  return {
    status,
    state,
    participants,
    activity,
    joinError,
    isReconnecting: status === "reconnecting" || status === "connecting",
    failed: status === "failed",
    retry,
  };
}
