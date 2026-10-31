"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import type {
  JamActivityItem,
  JamCooldownActivePayload,
  JamEndExtendedPayload,
  JamErrorPayload,
  JamNoteDto,
  JamNoteUpdatedPayload,
  JamParticipant,
  JamStatePayload,
  JamStorageWarningPayload,
  JamUserJoinedPayload,
  JamUserLeftPayload,
  DraftNote,
} from "@stave/shared-types";
import { jamNoteToDraftNote } from "@stave/shared-types";
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
  // ── UC-67: collaborative editing ─────────────────────────────
  /** 5.E1/BR-70 — the event ended (locally or via `jam:event_ended`). */
  isReadonly: boolean;
  /**
   * UC-95 — the server broadcast the end (`jam:ended` / `jam:event_ended`);
   * drives the frozen banner + "Xem kết quả Jam" in the live room.
   */
  endedByServer: boolean;
  /** 2.E1 — ms remaining on the caller's cooldown (0 = ready to edit). */
  cooldownRemainingMs: number;
  /** Seconds the server enforces between two edits of the same user. */
  cooldownSec: number;
  /**
   * 12.E1 — the background flush has failed repeatedly; the in-RAM snapshot
   * is still authoritative, and the UI shows the storage warning banner.
   * Clears automatically when a flush succeeds again.
   */
  storageWarning: JamStorageWarningPayload | null;
  /**
   * 8.E1 — the most recent note written by SOMEONE ELSE (drives the brief
   * "Nốt nhạc vừa được ghi đè bởi {username}" indicator).
   */
  lastRemoteNoteUpdate: {
    noteId: string;
    displayName: string | null;
    at: number;
  } | null;
  /** Send one `jam:edit_note` op (add / update / delete) to the room. */
  editNote: (
    action: "add" | "update" | "delete",
    note: JamNoteDto,
  ) => Promise<boolean>;
  /**
   * Local LWW apply of the room's snapshot notes — call with the new notes
   * array after `editNote` for optimistic UI; `jam:note_updated` broadcasts
   * reconcile everyone (including the sender) to the server's truth.
   */
  applyLocalNotes: (notes: DraftNote[]) => void;
}

export function useJamSocket(eventId: string | null): UseJamSocketResult {
  const [status, setStatus] = useState<JamSocketStatus>("idle");
  const [state, setState] = useState<JamStatePayload | null>(null);
  const [participants, setParticipants] = useState<JamParticipant[]>([]);
  const [activity, setActivity] = useState<JamActivityItem[]>([]);
  const [joinError, setJoinError] = useState<JamErrorPayload | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  // ── UC-67 live-edit state ──────────────────────────────────────────────────
  const [isReadonly, setIsReadonly] = useState(false);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  // UC-95 / BR-70 — set when the server broadcast the end (`jam:ended` or
  // `jam:event_ended`); the live room shows the frozen banner on this.
  const [endedByServer, setEndedByServer] = useState(false);
  const [storageWarning, setStorageWarning] = useState<JamStorageWarningPayload | null>(null);
  const [lastRemoteNoteUpdate, setLastRemoteNoteUpdate] = useState<{
    noteId: string;
    displayName: string | null;
    at: number;
  } | null>(null);

  const socketRef = useRef<Socket | null>(null);
  // The caller's own user id — needed to tell "my edit" from "someone else's"
  // on `jam:note_updated` (8.E1 only notifies on REMOTE writes).
  const myIdRef = useRef<string | null>(null);
  const lastEditSentRef = useRef(0);
  // The deadline the local cooldown countdown ticks down to (2.1: the client
  // owns the display of 2.E1 rejections between server pings).
  const cooldownUntilRef = useRef(0);
  const [cooldownSec, setCooldownSec] = useState(5);

  // Resolve the caller's Supabase user id once so event handlers can compare
  // against it (the socket handshake already knows who we are server-side; the
  // client just needs the id for the "is this me?" check).
  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      myIdRef.current = data.session?.user.id ?? null;
    })();
  }, []);

  const join = useCallback((nsp: Socket) => {
    if (!eventId) return;
    setJoinError(null);
    nsp.emit("jam:join", { eventId });
  }, [eventId]);

  // 8.E1 — apply one note op to the local snapshot so all clients converge
  // on the server's LWW truth. Idempotent: re-applying the same op is a no-op.
  const applyNoteOp = useCallback((action: "add" | "update" | "delete", note: JamNoteDto) => {
    setState((prev) => {
      if (!prev) return prev;
      const notes = [...prev.snapshot.notes];
      if (action === "delete") {
        return { ...prev, snapshot: { ...prev.snapshot, notes: notes.filter((n) => n.id !== note.id) } };
      }
      const draft = jamNoteToDraftNote(note);
      const idx = notes.findIndex((n) => n.id === note.id);
      if (idx >= 0) notes[idx] = draft;
      else notes.push(draft);
      return { ...prev, snapshot: { ...prev.snapshot, notes } };
    });
  }, []);

  // The caller asks us to push a new notes array into the snapshot — used for
  // optimistically applying the caller's own batch of local edits. The server
  // still reconciles everyone via `jam:note_updated` broadcasts (8.E1).
  const applyLocalNotes = useCallback((notes: DraftNote[]) => {
    setState((prev) => (prev ? { ...prev, snapshot: { ...prev.snapshot, notes } } : prev));
  }, []);

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
      if (typeof window !== "undefined") {
        (window as unknown as { __jamSocket?: Socket }).__jamSocket = nsp;
      }

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
        // Reset the local cooldown from the server's authoritative value. A
        // fresh join is to a live room, so clear the read-only flag.
        setCooldownSec(payload.cooldownSec);
        setIsReadonly(false);
        setEndedByServer(false);
        setStorageWarning(null);
      });

      // 8.E1 / BR-69 — the server applied one note op; apply the same op to
      // our snapshot so everyone converges on the server's LWW truth. When the
      // op came from someone else, also surface the "just overwritten" hint.
      nsp.on("jam:note_updated", (payload: JamNoteUpdatedPayload) => {
        if (disposed) return;
        applyNoteOp(payload.action, payload.note);

        const isMine = myIdRef.current !== null && payload.userId === myIdRef.current;
        if (!isMine) {
          setLastRemoteNoteUpdate({
            noteId: payload.note.id,
            displayName: payload.displayName,
            at: Date.now(),
          });
        }
        // Merge the op into the live activity feed as well.
        setActivity((prev) =>
          [
            ...prev,
            {
              id: `${payload.jamId}:${payload.timestamp}:${payload.action}:${payload.userId}`,
              userId: payload.userId,
              displayName: payload.displayName,
              at: new Date(payload.timestamp).toISOString(),
              op:
                payload.action === "delete"
                  ? ("remove" as const)
                  : payload.action === "add"
                    ? ("add" as const)
                    : ("update" as const),
              detail: `MIDI ${payload.note.midi}`,
            },
          ].slice(-50),
        );
      });

      // 2.E1 — the server rejected the caller's op for cooldown; the client
      // owns the countdown from here (2.1).
      nsp.on("jam:cooldown_active", (payload: JamCooldownActivePayload) => {
        if (disposed) return;
        // The server told us exactly how much time is left; the local
        // ticker counts down from this deadline until the next edit is
        // allowed (2.1 — the client owns the 2.E1 display).
        cooldownUntilRef.current = Date.now() + payload.remainingSeconds * 1000;
        setCooldownRemainingMs(payload.remainingSeconds * 1000);
      });

      // 5.E1 / BR-70 — the event ended; the room is frozen read-only from now.
      // UC-95: the server emits BOTH `jam:ended` (spec name) and
      // `jam:event_ended` (the legacy name) into the room; either one
      // freezes us — the handler is idempotent, so a double delivery is a
      // no-op.
      const onEventEnded = () => {
        if (disposed) return;
        setIsReadonly(true);
        setCooldownRemainingMs(0);
        setEndedByServer(true);
      };
      nsp.on("jam:ended", onEventEnded);
      nsp.on("jam:event_ended", onEventEnded);

      // UC-94 (BR-75) — the admin extended a running event's end time. Push
      // the new `endsAt` into our local payload so the countdown (the UI's
      // `jam-session` clock) restarts toward the new deadline. Read-only is
      // NOT set — the jam is still live, it just got longer.
      nsp.on("jam:end_extended", (payload: JamEndExtendedPayload) => {
        if (disposed) return;
        setState((prev) =>
          prev ? { ...prev, endsAt: payload.newEndAt } : prev,
        );
      });

      // 12.E1 — the background flush kept failing (or recovered); the in-RAM
      // snapshot is still live, but the UI must show / clear the warning.
      nsp.on("jam:storage_warning", (payload: JamStorageWarningPayload) => {
        if (disposed) return;
        if (payload.consecutiveFlushFailures === 0) {
          setStorageWarning(null);
        } else {
          setStorageWarning(payload);
        }
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
      setEndedByServer(false);
      setStatus("idle");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, retryNonce]);

  // 2.1 — the client owns the 2.E1 cooldown countdown between server pings:
  // tick down to the deadline we were given (or that we set after sending).
  useEffect(() => {
    if (status !== "connected" && status !== "reconnecting") return;
    const id = window.setInterval(() => {
      const remain = cooldownUntilRef.current - Date.now();
      setCooldownRemainingMs(remain > 0 ? remain : 0);
    }, 200);
    return () => clearInterval(id);
  }, [status]);

  // Send one `jam:edit_note` op. Locally pre-checks read-only + cooldown,
  // optimistically applies, then emits to the room. The server's
  // `jam:note_updated` (broadcast to everyone, incl. the sender) is the
  // authoritative reconciliation; a `jam:cooldown_active` rejection re-arms
  // the local clock. Resolves to whether the op was accepted for dispatch.
  const editNote = useCallback(
    async (action: "add" | "update" | "delete", note: JamNoteDto): Promise<boolean> => {
      const nsp = socketRef.current;
      if (!nsp || !eventId) return false;
      if (isReadonly) return false; // BR-70 — the room is frozen
      const now = Date.now();
      if (cooldownUntilRef.current > now) {
        setCooldownRemainingMs(cooldownUntilRef.current - now); // show the clock
        return false; // 2.E1 — still inside the cooldown window
      }
      // Arm the local clock for the next edit and apply optimistically.
      lastEditSentRef.current = now;
      cooldownUntilRef.current = now + cooldownSec * 1000;
      applyNoteOp(action, note);
      nsp.emit("jam:edit_note", {
        jamId: eventId,
        action,
        note,
        clientTimestamp: now,
      });
      return true;
    },
    [eventId, isReadonly, cooldownSec, applyNoteOp],
  );

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
    isReadonly,
    endedByServer,
    cooldownRemainingMs,
    cooldownSec,
    storageWarning,
    lastRemoteNoteUpdate,
    editNote,
    applyLocalNotes,
  };
}
