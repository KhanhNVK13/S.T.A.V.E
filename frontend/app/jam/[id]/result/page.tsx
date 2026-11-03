"use client";

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, TriangleAlert, ArrowLeft } from "lucide-react";
import type { JamResultResponseDto } from "@stave/shared-types";
import { getJamResult } from "../../../../lib/api-jam";
import { ApiError } from "../../../../lib/api-client";
import { apiErrorMessage } from "../../../../lib/error-message";
import { Card } from "../../../../components/ui/card";
import { Button } from "../../../../components/ui/button";
import { JamResultView } from "../../../../components/jam/jam-result-view";

/**
 * UC-68 — the frozen result of one ended Community Jam (`/jam/[id]/result`).
 * Public: guests can view; only the Fork button requires a login (1.E1/BR-12).
 *
 * 2.E3 unknown event / 2.E2 load failure: an `role="alert"` frame + retry.
 * 2.E4 the event has not ended yet: 400 → banner + auto-redirect to the live
 * room after a beat (it is still playing — the room is the right place).
 */

function ResultContent({ id }: { id: string }) {
  const router = useRouter();
  const [result, setResult] = useState<JamResultResponseDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const data = await getJamResult(id);
        if (cancelled) return;
        setResult(data);
      } catch (err) {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 400) {
          // 2.E4 — still running: bounce back to the live room.
          setRedirecting(true);
          setError(
            "Sự kiện Jam này vẫn đang diễn ra. Đang chuyển hướng bạn đến phòng Jam...",
          );
          setTimeout(() => {
            if (!cancelled) router.replace(`/jam/${id}`);
          }, 1500);
          return;
        }
        // 2.E3 — the id does not exist: exact spec copy (the 404 message in
        // `error-message.ts` belongs to UC-66 and must stay untouched).
        if (err instanceof ApiError && err.status === 404) {
          setError("Sự kiện Jam không tồn tại hoặc đã bị xóa.");
          return;
        }
        // 2.E2 — everything else is a real server/DB failure.
        setError(apiErrorMessage(err, "Không thể tải kết quả sự kiện Jam. Vui lòng thử lại."));
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, refreshKey]);

  if (redirecting) {
    return (
      <Card className="p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-accent" />
          <p className="text-sm text-muted">
            Sự kiện Jam này vẫn đang diễn ra.
            <br />
            Đang chuyển hướng bạn đến phòng Jam...
          </p>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-8">
        <div
          role="alert"
          className="flex flex-col items-center gap-3 text-center"
        >
          <TriangleAlert className="h-8 w-8 text-danger" />
          <p className="max-w-sm text-sm text-danger">{error}</p>
          <Button
            variant="secondary"
            onClick={() => {
              setResult(null);
              setError(null);
              setRedirecting(false);
              setRefreshKey((n) => n + 1);
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Thử lại
          </Button>
        </div>
      </Card>
    );
  }

  if (!result) {
    return <ResultSkeleton />;
  }

  return (
    <div className="space-y-4">
      <Button
        variant="ghost"
        onClick={() => router.push(`/jam/${id}`)}
        className="-ml-2"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Quay lại phòng Jam
      </Button>
      <JamResultView result={result} />
    </div>
  );
}

/** Loading state: skeleton mirroring the real layout (play bar, grid, avatars). */
function ResultSkeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="flex items-center justify-between">
        <div className="h-7 w-48 animate-pulse rounded-md bg-surface-subtle" />
        <div className="h-8 w-56 animate-pulse rounded-md bg-surface-subtle" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Card className="h-[320px] min-h-[320px] animate-pulse bg-surface-subtle lg:h-[460px]" />
        <Card className="flex h-[180px] animate-pulse bg-surface-subtle" />
      </div>
    </div>
  );
}

interface Props {
  params: Promise<{ id: string }>;
}

export default function JamResultPage({ params }: Props) {
  const { id } = use(params);
  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <ResultContent id={id} />
    </div>
  );
}
