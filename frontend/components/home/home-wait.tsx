"use client";

import { useSpaceScene } from "../space/use-space-scene";

export function HomeWait() {
  useSpaceScene("quiet", 0);
  return (
    <div role="status" aria-busy="true" className="mx-auto max-w-page px-5 py-8">
      <span className="sr-only">Đang tải…</span>
      <div aria-hidden="true" className="flex flex-col gap-6">
        <div className="h-9 w-72 max-w-full animate-pulse rounded-md bg-surface-subtle" />
        <div className="h-24 animate-pulse rounded-card border border-border bg-surface/85" />
        <div className="h-48 animate-pulse rounded-card border border-border bg-surface/85" />
      </div>
    </div>
  );
}
