"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import type { JamEvent } from "@stave/shared-types";
import { getJamEvent } from "../../../lib/api-jam";
import { apiErrorMessage } from "../../../lib/error-message";
import { useAuth } from "../../../context/auth-context";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { EmptyState } from "../../../components/ui/empty-state";
import { JamSession } from "../../../components/jam/jam-session";

/**
 * UC-66 — the shared room for one event (`/jam/[id]`).
 *
 * 1.E1: not signed in → redirect to `/login` with a return URL. 2.E1 (ended
 * event): the room still renders as read-only and points at the result view
 * (UC-68). 3.E1 (socket failure) is handled inside `JamSession` with a
 * "Không vào được phiên" + retry, never a silently blank roll.
 */

function JamRoomContent({ id }: { id: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [event, setEvent] = useState<JamEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // 1.E1 — unauthenticated: go to login and come back here. The login page
  // reads the `redirect` search param (see `app/login/page.tsx`), matching
  // the `projects/[id]` gate, so the user lands back on this room.
  useEffect(() => {
    if (!loading && !user) {
      router.replace(`/login?redirect=${encodeURIComponent(`/jam/${id}`)}`);
    }
  }, [loading, user, router, id]);

  // Load the event (and on every "Thử lại"). No synchronous setState in the
  // effect body: the async function only sets state after the first await —
  // same rule this codebase applies in `projects/[id]`.
  useEffect(() => {
    let cancelled = false;
    if (loading || !user) return;

    async function load() {
      try {
        const data = await getJamEvent(id);
        if (cancelled) return;
        setEvent(data);
      } catch (err) {
        if (cancelled) return;
        setError(apiErrorMessage(err, "Không thể tải sự kiện này."));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id, user, loading, refreshKey]);

  // UC-66 2.E1 → UC-68: the event already ended — the room itself is the
  // wrong place; the frozen result page is. Bounce straight to it.
  useEffect(() => {
    if (event && event.status === "ended") {
      router.replace(`/jam/${id}/result`);
    }
  }, [event, id, router]);

  if (loading || !user) {
    return (
      <div className="flex items-center justify-center gap-2 p-12 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-accent" />
        Đang tải…
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8">
        <EmptyState
          icon={TriangleAlert}
          title="Không tải được sự kiện"
          description={error}
          action={
            <Button
              variant="secondary"
              onClick={() => {
                setEvent(null);
                setError(null);
                setRefreshKey((n) => n + 1);
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" /> Thử lại
            </Button>
          }
        />
      </Card>
    );
  }

  if (!event) {
    return (
      <Card className="flex min-h-[240px] items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="h-4 w-4 animate-spin text-accent" />
          Đang tải sự kiện…
        </div>
      </Card>
    );
  }

  return <JamSession event={event} />;
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function JamRoomPage({ params }: Props) {
  const { id } = use(params);
  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <JamRoomContent id={id} />
    </div>
  );
}
