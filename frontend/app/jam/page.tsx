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
import { useI18n } from "../../context/i18n-context";

/**
 * UC-66 — the Community Jam listing. Events are grouped into "Đang diễn ra"
 * (active), "Sắp diễn ra" (scheduled) and "Đã kết thúc" (ended/cancelled).
 * A card carries the name, a countdown / opening time, the live participant
 * count, and a "Tham gia ngay" entry into the shared room.
 */

type Group = "active" | "scheduled" | "ended";

function groupOf(event: JamEventListItem): Group {
  const s = event.status as JamEventStatus;
  if (s === "active") return "active";
  if (s === "scheduled" || s === "cancelled") return "scheduled";
  return "ended";
}

function EventCard({ event }: { event: JamEventListItem }) {
  const { t } = useI18n();
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
        {t("jam.waiting")}
      </span>
    );

  const statusLine = (() => {
    if (groupOf(event) === "active") {
      return (
        <Badge variant="success">
          {event.scheduled_end_at
            ? t("jam.endsAt", { when: formatDateTime(event.scheduled_end_at) })
            : t("jam.live")}
        </Badge>
      );
    }
    if (groupOf(event) === "scheduled") {
      return (
        <Badge variant="info">
          <CalendarClock className="h-3.5 w-3.5" />
          {event.scheduled_start_at
            ? t("jam.opensAt", { when: formatDateTime(event.scheduled_start_at) })
            : t("jam.upcoming")}
        </Badge>
      );
    }
    return <Badge variant="neutral">{t("jam.ended")}</Badge>;
  })();

  return (
    <div className="flex flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface p-4">
      <div
        aria-hidden="true"
        className="-mx-4 -mt-4 h-[21px] bg-[repeating-linear-gradient(to_bottom,transparent_0_4px,var(--border)_4px_5px)]"
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-base font-semibold">
            {event.name || t("jam.room")}
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
          <Button>{t("jam.joinNow")}</Button>
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
  const { t } = useI18n();
  const [tab, setTab] = useState<Group>("active");
  const [nonce, setNonce] = useState(0);

  // `useApiResource` derives `loading` without any setState in an effect body
  // (the `react-hooks/set-state-in-effect` rule). Bumping `nonce` is the retry
  // lever: "Thử lại" / "Làm mới" just bump it and the resource re-fetches.
  const { data: items, loading, error } = useApiResource<JamEventListItem[]>(
    () => getJamEvents(),
    [nonce],
    t("jam.loadListFail"),
  );

  const tabs: { id: Group; label: string }[] = [
    { id: "active", label: t("jam.tabActive") },
    { id: "scheduled", label: t("jam.tabScheduled") },
    { id: "ended", label: t("jam.tabEnded") },
  ];
  const list = items ?? [];
  const visible = list.filter((e) => groupOf(e) === tab);

  return (
    <div className="mx-auto max-w-page px-5 py-8">
      <PageHeader
        breadcrumbs={[{ label: t("jam.crumb") }]}
        title={t("jam.title")}
        description={t("jam.description")}
      />

      <Tabs tabs={tabs} active={tab} onChange={(id) => setTab(id as Group)} />

      <div className="mt-4">
        {error ? (
          <EmptyState
            icon={Music4}
            title={t("jam.listFailTitle")}
            description={error}
            action={
              <Button variant="secondary" onClick={() => setNonce((n) => n + 1)}>
                <RefreshCw className="h-3.5 w-3.5" /> {t("ui.retry")}
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
            title={t("jam.noneTitle")}
            description={t("jam.noneBody")}
            action={
              <Button variant="ghost" onClick={() => setNonce((n) => n + 1)}>
                <RefreshCw className="h-3.5 w-3.5" /> {t("jam.refresh")}
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
