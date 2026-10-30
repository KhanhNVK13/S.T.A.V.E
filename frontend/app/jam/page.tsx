"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock, Music4, Users, RefreshCw } from "lucide-react";
import type {
  JamEventListItem,
  JamEventStatus,
} from "@stave/shared-types";
import { getJamEvents } from "../../lib/api-jam";
import { useApiResource } from "../../lib/use-api-resource";
import { formatDateTime } from "../../lib/format-date";
import { PageHeader } from "../../components/ui/page-header";
import { EmptyState } from "../../components/ui/empty-state";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Tabs } from "../../components/ui/tabs";

/**
 * UC-66 — the Community Jam listing. Events are grouped into "Đang diễn ra"
 * (active), "Sắp diễn ra" (scheduled) and "Đã kết thúc" (ended/cancelled).
 * A card carries the name, a countdown / opening time, the live participant
 * count, and a "Tham gia ngay" entry into the shared room.
 */

type Group = "active" | "scheduled" | "ended";

const TABS: { id: Group; label: string }[] = [
  { id: "active", label: "Đang diễn ra" },
  { id: "scheduled", label: "Sắp diễn ra" },
  { id: "ended", label: "Đã kết thúc" },
];

function groupOf(event: JamEventListItem): Group {
  const s = event.status as JamEventStatus;
  if (s === "active") return "active";
  if (s === "scheduled" || s === "cancelled") return "scheduled";
  return "ended";
}

function EventCard({ event }: { event: JamEventListItem }) {
  const joined =
    event.currentParticipantCount > 0 ? (
      <span className="flex items-center gap-1.5 text-sm text-muted">
        <Users className="h-4 w-4" />
        {event.currentParticipantCount}
        <span>/ {event.max_participants}</span>
      </span>
    ) : (
      <span className="flex items-center gap-1.5 text-sm text-muted">
        <Users className="h-4 w-4" />
        Chờ người tham gia
      </span>
    );

  const statusLine = (() => {
    if (groupOf(event) === "active") {
      return (
        <Badge variant="success">
          {event.scheduled_end_at
            ? `Kết thúc ${formatDateTime(event.scheduled_end_at)}`
            : "Đang diễn ra"}
        </Badge>
      );
    }
    if (groupOf(event) === "scheduled") {
      return (
        <Badge variant="info">
          <CalendarClock className="h-3.5 w-3.5" />
          {event.scheduled_start_at
            ? `Mở ${formatDateTime(event.scheduled_start_at)}`
            : "Sắp diễn ra"}
        </Badge>
      );
    }
    return <Badge variant="neutral">Đã kết thúc</Badge>;
  })();

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-semibold">
            {event.name || "Phòng Jam"}
          </span>
          {statusLine}
        </div>
      </div>

      {event.description && (
        <p className="line-clamp-2 text-sm text-muted">{event.description}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2">
        {joined}
        <Link href={`/jam/${event.id}`}>
          <Button>Tham gia ngay</Button>
        </Link>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-card border border-border bg-surface p-4">
      <div className="mb-3 h-4 w-1/2 rounded bg-surface-subtle" />
      <div className="h-3 w-2/3 rounded bg-surface-subtle" />
      <div className="mt-5 flex justify-end">
        <div className="h-8 w-28 rounded-md bg-surface-subtle" />
      </div>
    </div>
  );
}

export function JamListContent() {
  const [tab, setTab] = useState<Group>("active");
  const [nonce, setNonce] = useState(0);

  // `useApiResource` derives `loading` without any setState in an effect body
  // (the `react-hooks/set-state-in-effect` rule). Bumping `nonce` is the retry
  // lever: "Thử lại" / "Làm mới" just bump it and the resource re-fetches.
  const { data: items, loading, error } = useApiResource<JamEventListItem[]>(
    () => getJamEvents(),
    [nonce],
    "Không thể tải danh sách sự kiện Jam.",
  );

  const list = items ?? [];
  const visible = list.filter((e) => groupOf(e) === tab);

  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <PageHeader
        breadcrumbs={[{ label: "Community" }]}
        title="Community Jam"
        description="Phòng nhạc chung — nhiều người cùng góp nốt trong một bản."
      />

      <Tabs tabs={TABS} active={tab} onChange={(id) => setTab(id as Group)} />

      <div className="mt-4">
        {error ? (
          <EmptyState
            icon={Music4}
            title="Không tải được danh sách sự kiện"
            description={error}
            action={
              <Button variant="secondary" onClick={() => setNonce((n) => n + 1)}>
                <RefreshCw className="h-3.5 w-3.5" /> Thử lại
              </Button>
            }
          />
        ) : loading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Music4}
            title="Hiện chưa có sự kiện Community Jam nào trong nhóm này"
            description="Hãy quay lại sau!"
            action={
              <Button variant="ghost" onClick={() => setNonce((n) => n + 1)}>
                <RefreshCw className="h-3.5 w-3.5" /> Làm mới
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {visible.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function JamListPage() {
  return <JamListContent />;
}
