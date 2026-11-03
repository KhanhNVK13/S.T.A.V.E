"use client";

import { useEffect, useState } from "react";

/**
 * UC-66 — the remaining-time clock for a running jam. Ticks every second
 * toward `endsAt` (ISO). At or past the target it reads 00:00 and stops.
 * `scheduledEndAt` may be null (open-ended event) → nothing is shown.
 */

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0
    ? `${pad(h)}:${pad(m)}:${pad(s)}`
    : `${pad(m)}:${pad(s)}`;
}

export function JamCountdownTimer({
  endsAt,
}: {
  endsAt: string | null;
}) {
  const [now, setNow] = useState(() => Date.now());

  const target = endsAt ? new Date(endsAt).getTime() : null;

  // Only run the 1s clock while time actually remains; once (or before) the
  // target has passed nothing has to tick and the "Đã kết thúc" state is
  // derived, not forced.
  useEffect(() => {
    if (!target || target <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target]);

  if (!target) return null;

  const remaining = target - now;
  const isOver = remaining <= 0;

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1 text-sm font-semibold tabular-nums"
      role="timer"
      aria-label={isOver ? "Sự kiện đã kết thúc" : `Còn ${formatRemaining(remaining)}`}
    >
      {isOver ? (
        <span className="text-muted">Đã kết thúc</span>
      ) : (
        <>
          <span className="text-xs font-normal text-muted">Còn</span>
          <span className="text-accent">{formatRemaining(remaining)}</span>
        </>
      )}
    </span>
  );
}
