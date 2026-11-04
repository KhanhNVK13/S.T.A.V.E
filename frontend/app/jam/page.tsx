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
import { RowHeader, RowItem, RowList } from "../../components/ui/row-list";
import { PageHeader } from "../../components/ui/page-header";
import { EmptyState } from "../../components/ui/empty-state";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Tabs } from "../../components/ui/tabs";
import { useI18n } from "../../context/i18n-context";

type Group = "active" | "scheduled" | "ended";

const COLS = "md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_120px_auto]";

function groupOf(event: JamEventListItem): Group {
  const s = event.status as JamEventStatus;
  if (s === "active") return "active";
  if (s === "scheduled" || s === "cancelled") return "scheduled";
  return "ended";
}

function EventRow({ event }: { event: JamEventListItem }) {
  const { t } = useI18n();
  const group = groupOf(event);

  const statusBadge =
    group === "active" ? (
      <Badge variant="success">
        {event.scheduled_end_at
          ? t("jam.endsAt", { when: formatDateTime(event.scheduled_end_at) })
          : t("jam.live")}
      </Badge>
    ) : group === "scheduled" ? (
      <Badge variant="info">
        <CalendarClock aria-hidden="true" className="h-3.5 w-3.5" />
        {event.scheduled_start_at
          ? t("jam.opensAt", { when: formatDateTime(event.scheduled_start_at) })
          : t("jam.upcoming")}
      </Badge>
    ) : (
      <Badge variant="neutral">{t("jam.ended")}</Badge>
    );

  return (
    <RowItem>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Link
          href={`/jam/${event.id}`}
          className="truncate text-[13px] font-semibold hover:text-accent hover:underline"
        >
          {event.name || t("jam.room")}
        </Link>
        {event.description && <span className="line-clamp-2 text-xs text-muted">{event.description}</span>}
      </div>
      <div className="min-w-0">{statusBadge}</div>
      <span className="flex items-center gap-1.5 font-mono text-xs text-muted">
        <Users aria-hidden="true" className="h-3.5 w-3.5" />
        {event.currentParticipantCount > 0
          ? `${event.currentParticipantCount} / ${event.max_participants}`
          : t("jam.waiting")}
      </span>
      <Link href={`/jam/${event.id}`} className="md:justify-self-end">
        <Button variant={group === "active" ? "primary" : "secondary"}>{t("jam.joinNow")}</Button>
      </Link>
    </RowItem>
  );
}

function ListSkeleton() {
  return (
    <RowList>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex min-h-[68px] animate-pulse flex-col justify-center gap-1.5 border-b border-border px-3.5 py-3 last:border-b-0"
        >
          <div className="h-3 w-1/3 rounded bg-surface-subtle" />
          <div className="h-2.5 w-1/2 rounded bg-surface-subtle" />
        </div>
      ))}
    </RowList>
  );
}

export function JamListContent() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Group>("active");
  const [nonce, setNonce] = useState(0);

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
    <div className="mx-auto min-h-full w-full max-w-page px-5 py-8">
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
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> {t("ui.retry")}
              </Button>
            }
          />
        ) : loading ? (
          <ListSkeleton />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Music4}
            title={t("jam.noneTitle")}
            description={t("jam.noneBody")}
            action={
              <Button variant="ghost" onClick={() => setNonce((n) => n + 1)}>
                <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" /> {t("jam.refresh")}
              </Button>
            }
          />
        ) : (
          <RowList cols={COLS}>
            <RowHeader>
              <span>{t("jamPage.colEvent")}</span>
              <span>{t("jamPage.colStatus")}</span>
              <span>{t("jamPage.colPeople")}</span>
              <span />
            </RowHeader>
            {visible.map((event) => (
              <EventRow key={event.id} event={event} />
            ))}
          </RowList>
        )}
      </div>
    </div>
  );
}

export default function JamListPage() {
  return <JamListContent />;
}
