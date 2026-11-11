"use client";

import { useEffect, useRef, useState } from "react";
import { Activity } from "lucide-react";
import type { ActivityItem, ActivityType } from "@stave/shared-types";
import { getUserActivity, type ActivityQuery } from "../../../../../lib/admin-activity-api";
import { computeActivityRange, type ActivityRange } from "./activity-range";
import { formatOccurredAt } from "./format-occurred-at";
import { errorSource, renderError, type ErrorSource } from "../../../../../lib/error-message";
import { type TKey } from "../../../../../lib/i18n";
import { useI18n } from "../../../../../context/i18n-context";
import { PageHeader } from "../../../../../components/ui/page-header";
import { RowList, RowHeader, RowItem } from "../../../../../components/ui/row-list";
import { Button } from "../../../../../components/ui/button";
import { EmptyState } from "../../../../../components/ui/empty-state";
import { Field, INPUT_CLASS } from "../../../../../components/ui/form";

const COLS = "md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_210px_150px]";
const PAGE_SIZE = 50;

const TYPE_OPTIONS: { value: "all" | ActivityType; label: TKey }[] = [
  { value: "all", label: "aact.typeAll" },
  { value: "signin", label: "aact.typeSignin" },
  { value: "projects", label: "aact.typeProjects" },
  { value: "subscription", label: "aact.typeSubscription" },
  { value: "community", label: "aact.typeCommunity" },
];

const ACTION_LABELS: Record<string, TKey> = {
  "auth.sign_in": "aact.act.auth.sign_in",
  "project.created": "aact.act.project.created",
  "project.deleted": "aact.act.project.deleted",
  "project.published": "aact.act.project.published",
  "subscription.started": "aact.act.subscription.started",
};

function actionLabelKey(action: string): TKey {
  const known = ACTION_LABELS[action];
  if (known) return known;
  return action.startsWith("community.") ? "aact.act.community" : "aact.act.unknown";
}

type LoadState = "loading" | "ready" | "error";

interface Filters {
  from: string;
  to: string;
  type: "all" | ActivityType;
}

function buildQuery(
  range: ActivityRange,
  type: Filters["type"],
  cursor: string | null,
): ActivityQuery {
  return {
    from: range.from,
    to: range.to,
    type: type === "all" ? undefined : type,
    limit: PAGE_SIZE,
    cursor,
  };
}

export function ActivityView({ userId }: { userId: string }) {
  const { t, locale } = useI18n();
  const [filters, setFilters] = useState<Filters>({ from: "", to: "", type: "all" });
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [error, setError] = useState<ErrorSource | null>(null);
  const [moreLoading, setMoreLoading] = useState(false);
  const [moreError, setMoreError] = useState<ErrorSource | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const generation = useRef(0);
  const rangeRef = useRef<ActivityRange | null>(null);
  const moreAbort = useRef<AbortController | null>(null);

  const rangeInvalid = computeActivityRange(filters) === null;

  useEffect(() => {
    const range = computeActivityRange(filters);
    if (!range) return;
    rangeRef.current = range;
    const controller = new AbortController();
    const current = ++generation.current;

    void (async () => {
      setState("loading");
      setError(null);
      setItems([]);
      setNextCursor(null);
      setMoreError(null);
      setMoreLoading(false);
      try {
        const page = await getUserActivity(
          userId,
          buildQuery(range, filters.type, null),
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setState("ready");
      } catch (err) {
        if (controller.signal.aborted || current !== generation.current) return;
        setError(errorSource(err, "aact.loadFail"));
        setState("error");
      }
    })();

    return () => {
      controller.abort();
      moreAbort.current?.abort();
      moreAbort.current = null;
    };
  }, [userId, filters, reloadKey]);

  const loadMore = async () => {
    const range = rangeRef.current;
    if (!nextCursor || moreLoading || !range) return;
    const current = generation.current;
    const controller = new AbortController();
    moreAbort.current?.abort();
    moreAbort.current = controller;
    setMoreLoading(true);
    setMoreError(null);
    try {
      const page = await getUserActivity(
        userId,
        buildQuery(range, filters.type, nextCursor),
        controller.signal,
      );
      if (controller.signal.aborted || current !== generation.current) return;
      setItems((previous) => {
        const seen = new Set(previous.map((item) => item.id));
        return [...previous, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (err) {
      if (controller.signal.aborted || current !== generation.current) return;
      setMoreError(errorSource(err, "aact.loadFail"));
    } finally {
      if (!controller.signal.aborted && current === generation.current) setMoreLoading(false);
      if (moreAbort.current === controller) moreAbort.current = null;
    }
  };

  const view: LoadState | null = rangeInvalid ? null : state;

  const update = (patch: Partial<Filters>) => setFilters((previous) => ({ ...previous, ...patch }));

  return (
    <div>
      <PageHeader
        title={t("aact.title")}
        description={t("aact.description")}
        breadcrumbs={[{ label: t("au.title"), href: "/admin/users" }, { label: t("aact.title") }]}
      />

      <div className="mb-3 flex flex-wrap items-end gap-3">
        <Field label={t("aact.filterFrom")} error={rangeInvalid ? t("aact.rangeInvalid") : null}>
          <input
            type="date"
            name="activity-from"
            autoComplete="off"
            className={INPUT_CLASS}
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => update({ from: e.target.value })}
          />
        </Field>
        <Field label={t("aact.filterTo")}>
          <input
            type="date"
            name="activity-to"
            autoComplete="off"
            className={INPUT_CLASS}
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => update({ to: e.target.value })}
          />
        </Field>
        <Field label={t("aact.filterType")}>
          <select
            name="activity-type"
            className={INPUT_CLASS}
            value={filters.type}
            onChange={(e) => update({ type: e.target.value as Filters["type"] })}
          >
            {TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {t(option.label)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <p className="mb-1 text-xs text-muted">{t("aact.defaultRange")}</p>
      <p className="mb-1 text-xs text-muted">{t("aact.locationNote")}</p>
      <p className="mb-4 text-xs text-muted">{t("aact.ipNote")}</p>

      {view === "error" && (
        <div
          role="alert"
          className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          <span>{renderError(error)}</span>
          <Button variant="secondary" onClick={() => setReloadKey((key) => key + 1)}>
            {t("ui.retry")}
          </Button>
        </div>
      )}

      {view === "loading" && (
        <p role="status" className="py-8 text-center text-sm text-muted">
          {t("ui.loading")}
        </p>
      )}

      {view === "ready" && items.length === 0 && (
        <EmptyState icon={Activity} title={t("aact.empty")} description={t("aact.emptyHint")} />
      )}

      {view === "ready" && items.length > 0 && (
        <RowList cols={COLS}>
          <RowHeader>
            <span>{t("aact.colAction")}</span>
            <span>{t("aact.colTarget")}</span>
            <span>{t("aact.colWhen")}</span>
            <span>{t("aact.colIp")}</span>
          </RowHeader>
          {items.map((item) => (
            <RowItem key={item.id}>
              <span className="text-[13px] font-medium">{t(actionLabelKey(item.action))}</span>
              <span className="min-w-0 truncate text-[13px] text-muted">
                {item.targetName ?? "—"}
                {item.targetDeleted && (
                  <span className="ml-1.5 text-warning-foreground">{t("aact.deleted")}</span>
                )}
              </span>
              <span className="font-mono text-xs text-muted">
                {formatOccurredAt(item.occurredAt, locale)}
              </span>
              <span className="font-mono text-xs text-muted">{item.ipMasked ?? "—"}</span>
            </RowItem>
          ))}
        </RowList>
      )}

      {view === "ready" && moreError && (
        <div
          role="alert"
          className="mt-3 rounded-card bg-danger-muted px-3 py-2 text-xs text-danger"
        >
          {renderError(moreError)}
        </div>
      )}

      {view === "ready" && nextCursor && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" disabled={moreLoading} onClick={() => void loadMore()}>
            {moreLoading ? t("ui.loading") : t("aact.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
