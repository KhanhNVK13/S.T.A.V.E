"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { StatsPart, StatsPeriod, StatsSeriesPoint } from "@stave/shared-types";
import { PageHeader } from "../../../components/ui/page-header";
import { Card } from "../../../components/ui/card";
import { Button } from "../../../components/ui/button";
import { MiniChart } from "../../../components/admin/mini-chart";
import { getAdminOverview } from "../../../lib/admin-stats-api";
import { formatVnd } from "../../../lib/format-vnd";
import { useApiResource } from "../../../lib/use-api-resource";
import { useI18n } from "../../../context/i18n-context";

const PRESETS = [7, 30, 90, 365] as const;
const DAY_MS = 86_400_000;

function rangeFor(days: number): { from: string; to: string } {
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  return {
    from: new Date(today - (days - 1) * DAY_MS).toISOString().slice(0, 10),
    to: new Date(today).toISOString().slice(0, 10),
  };
}

function Stat({
  label,
  value,
  format,
  previous,
  href,
  vsLabel,
}: {
  label: string;
  value: number;
  format: (n: number) => string;
  previous?: number | null;
  href?: string;
  vsLabel?: (delta: string) => string;
}) {
  const delta = previous === null || previous === undefined ? null : value - previous;
  const shown = format(value);
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-2xl font-semibold tabular-nums">
        {href ? (
          <Link href={href} aria-label={`${label}: ${shown}`} className="rounded-card hover:text-accent">
            {shown}
          </Link>
        ) : (
          shown
        )}
      </dd>
      {delta !== null && vsLabel && (
        <dd className="text-xs text-muted tabular-nums">{vsLabel(`${delta > 0 ? "+" : ""}${format(delta)}`)}</dd>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-4">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
    </Card>
  );
}

function Unavailable({ message }: { message: string }) {
  return <p className="text-sm text-muted">{message}</p>;
}

export default function AdminDashboardPage() {
  const { t, locale } = useI18n();
  const [days, setDays] = useState<number>(30);
  const [range, setRange] = useState(() => rangeFor(30));
  const [compare, setCompare] = useState(true);
  const [reload, setReload] = useState(0);

  const { data, loading, error } = useApiResource(
    () => getAdminOverview(range.from, range.to, compare),
    [range.from, range.to, compare, reload],
    t("dash.loadFail"),
  );

  function pickPreset(next: number) {
    setDays(next);
    setRange(rangeFor(next));
  }

  const number = (n: number) => n.toLocaleString(locale);
  const vs = (delta: string) => t("dash.vsPrevious", { delta });
  const unavailable = t("dash.unavailable");
  const noData = t("dash.noData");

  function labelOf(period: StatsPeriod, point: StatsSeriesPoint): string {
    const date = new Date(point.date);
    const options: Intl.DateTimeFormatOptions =
      period.granularity === "month"
        ? { month: "short", year: "2-digit", timeZone: "UTC" }
        : { month: "short", day: "numeric", timeZone: "UTC" };
    return date.toLocaleDateString(locale, options);
  }

  function renderGrowth(part: StatsPart<{ noData: boolean; totalUsers: number; totals: { newUsers: number; activeUsers: number }; previous: { newUsers: number; activeUsers: number } | null; series: StatsSeriesPoint[] }>, period: StatsPeriod) {
    if (!part.available) return <Unavailable message={unavailable} />;
    if (part.noData) return <Unavailable message={noData} />;
    return (
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Stat label={t("dash.totalUsers")} value={part.totalUsers} format={number} />
          <Stat label={t("dash.newUsers")} value={part.totals.newUsers} format={number} previous={part.previous?.newUsers} vsLabel={vs} />
          <Stat label={t("dash.activeUsers")} value={part.totals.activeUsers} format={number} previous={part.previous?.activeUsers} vsLabel={vs} />
        </dl>
        <MiniChart
          title={t("dash.growthChart")}
          labelHeader={t("dash.colDate")}
          tableLabel={t("dash.showTable")}
          series={[
            { name: t("dash.newUsers"), tone: "accent", points: part.series.map((p) => ({ label: labelOf(period, p), value: p.newUsers })) },
            { name: t("dash.activeUsers"), tone: "success", points: part.series.map((p) => ({ label: labelOf(period, p), value: p.activeUsers })) },
          ]}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t("dash.title")} description={t("dash.description")} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={t("dash.periodLabel")} className="flex flex-wrap gap-2">
          {PRESETS.map((n) => (
            <Button
              key={n}
              variant={days === n ? "primary" : "secondary"}
              aria-pressed={days === n}
              onClick={() => pickPreset(n)}
            >
              {t("dash.lastDays", { n })}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="compare"
            checked={compare}
            onChange={(e) => setCompare(e.target.checked)}
            className="accent-accent"
          />
          {t("dash.compare")}
        </label>
      </div>

      {loading ? (
        <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-accent" /> {t("ui.loading")}
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-card bg-danger-muted px-3 py-2 text-sm text-danger"
        >
          <span>{error}</span>
          <Button variant="secondary" onClick={() => setReload((n) => n + 1)}>
            {t("ui.retry")}
          </Button>
        </div>
      ) : data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title={t("dash.growth")}>{renderGrowth(data.growth, data.period)}</Section>

          <Section title={t("dash.usage")}>
            {!data.usage.available ? (
              <Unavailable message={unavailable} />
            ) : data.usage.noData ? (
              <Unavailable message={noData} />
            ) : (
              <div className="flex flex-col gap-4">
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                  <Stat label={t("dash.newProjects")} value={data.usage.totals.newProjects} format={number} previous={data.usage.previous?.newProjects} vsLabel={vs} />
                  <Stat label={t("dash.commits")} value={data.usage.totals.commits} format={number} previous={data.usage.previous?.commits} vsLabel={vs} />
                  <Stat label={t("dash.newBranches")} value={data.usage.totals.newBranches} format={number} previous={data.usage.previous?.newBranches} vsLabel={vs} />
                  <Stat label={t("dash.merges")} value={data.usage.totals.merges} format={number} previous={data.usage.previous?.merges} vsLabel={vs} />
                  <Stat label={t("dash.forks")} value={data.usage.totals.forks} format={number} previous={data.usage.previous?.forks} vsLabel={vs} />
                  <Stat label={t("dash.pullRequests")} value={data.usage.totals.pullRequests} format={number} previous={data.usage.previous?.pullRequests} vsLabel={vs} />
                </dl>
                <MiniChart
                  title={t("dash.usageChart")}
                  labelHeader={t("dash.colDate")}
                  tableLabel={t("dash.showTable")}
                  series={[
                    { name: t("dash.commits"), tone: "accent", points: data.usage.series.map((p) => ({ label: labelOf(data.period, p), value: p.commits })) },
                    { name: t("dash.newProjects"), tone: "success", points: data.usage.series.map((p) => ({ label: labelOf(data.period, p), value: p.newProjects })) },
                  ]}
                />
              </div>
            )}
          </Section>

          <Section title={t("dash.plans")}>
            {!data.plans.available ? (
              <Unavailable message={unavailable} />
            ) : data.plans.plans.length === 0 ? (
              <Unavailable message={noData} />
            ) : (
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {data.plans.plans.map((plan) => (
                  <Stat key={plan.name} label={plan.name} value={plan.count} format={number} />
                ))}
              </dl>
            )}
          </Section>

          <Section title={t("dash.attention")}>
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {data.finance.available ? (
                <>
                  <Stat label={t("dash.revenue")} value={data.finance.revenueVnd} format={formatVnd} href="/admin/transactions" />
                  <Stat label={t("dash.failedTransactions")} value={data.finance.failedTransactions} format={number} href="/admin/transactions" />
                </>
              ) : (
                <div className="col-span-full">
                  <Unavailable message={unavailable} />
                </div>
              )}
              {data.moderation.available ? (
                <>
                  <Stat label={t("dash.openReports")} value={data.moderation.openReports} format={number} href="/admin/reports" />
                  <Stat label={t("dash.openPaymentIssues")} value={data.moderation.openPaymentIssues} format={number} href="/admin/payment-issues" />
                </>
              ) : (
                <div className="col-span-full">
                  <Unavailable message={unavailable} />
                </div>
              )}
            </dl>
          </Section>
        </div>
      ) : null}

      <p className="text-xs text-muted">{t("dash.utcNote")}</p>
    </div>
  );
}
