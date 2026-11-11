import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminOverviewStats,
  GrowthStats,
  GrowthTotals,
  StatsPart,
  StatsSeriesPoint,
  UsageStats,
  UsageTotals,
} from '@stave/shared-types';
import { SUPABASE_ADMIN_CLIENT } from '../supabase/supabase.constants';
import { resolvePeriod, type ResolvedPeriod } from './admin-stats.logic';

interface SummaryRow {
  o_total_users: number | string;
  o_first_user_at: string | null;
  o_new_users: number | string;
  o_active_users: number | string;
  o_projects: number | string;
  o_commits: number | string;
  o_branches: number | string;
  o_merges: number | string;
  o_forks: number | string;
  o_pull_requests: number | string;
  o_revenue_vnd: number | string;
  o_failed_transactions: number | string;
  o_open_reports: number | string;
  o_open_payment_issues: number | string;
}

interface SeriesRow {
  o_bucket: string;
  o_new_users: number | string;
  o_active_users: number | string;
  o_new_projects: number | string;
  o_commits: number | string;
  o_branches: number | string;
  o_merges: number | string;
  o_forks: number | string;
  o_pull_requests: number | string;
}

interface Loaders {
  resolved: ResolvedPeriod;
  current: () => Promise<SummaryRow>;
  series: () => Promise<StatsSeriesPoint[]>;
  previous: () => Promise<SummaryRow | null>;
}

function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | undefined;
  return () => (pending ??= load());
}

const num = (value: number | string | null | undefined): number =>
  Number(value ?? 0);

function growthTotals(row: SummaryRow): GrowthTotals {
  return {
    newUsers: num(row.o_new_users),
    activeUsers: num(row.o_active_users),
  };
}

function usageTotals(row: SummaryRow): UsageTotals {
  return {
    newProjects: num(row.o_projects),
    commits: num(row.o_commits),
    newBranches: num(row.o_branches),
    merges: num(row.o_merges),
    forks: num(row.o_forks),
    pullRequests: num(row.o_pull_requests),
  };
}

@Injectable()
export class AdminStatsService {
  private readonly logger = new Logger(AdminStatsService.name);

  constructor(
    @Inject(SUPABASE_ADMIN_CLIENT)
    private readonly supabase: SupabaseClient,
  ) {}

  async growth(
    from: string | undefined,
    to: string | undefined,
    compare: boolean,
  ): Promise<GrowthStats> {
    const resolved = resolvePeriod(from, to);
    const body = await this.buildGrowth(this.loaders(resolved, compare));
    return { period: resolved.period, ...body };
  }

  async usage(
    from: string | undefined,
    to: string | undefined,
    compare: boolean,
  ): Promise<UsageStats> {
    const resolved = resolvePeriod(from, to);
    const body = await this.buildUsage(this.loaders(resolved, compare));
    return { period: resolved.period, ...body };
  }

  async overview(
    from: string | undefined,
    to: string | undefined,
    compare: boolean,
  ): Promise<AdminOverviewStats> {
    const resolved = resolvePeriod(from, to);
    const loaders = this.loaders(resolved, compare);
    const [growth, usage, plans, finance, moderation] = await Promise.all([
      this.part('growth', () => this.buildGrowth(loaders)),
      this.part('usage', () => this.buildUsage(loaders)),
      this.part('plans', () => this.buildPlans()),
      this.part('finance', async () => {
        const row = await loaders.current();
        return {
          revenueVnd: num(row.o_revenue_vnd),
          failedTransactions: num(row.o_failed_transactions),
        };
      }),
      this.part('moderation', async () => {
        const row = await loaders.current();
        return {
          openReports: num(row.o_open_reports),
          openPaymentIssues: num(row.o_open_payment_issues),
        };
      }),
    ]);
    return {
      period: resolved.period,
      growth,
      usage,
      plans,
      finance,
      moderation,
    };
  }

  private async part<T extends object>(
    name: string,
    build: () => Promise<T>,
  ): Promise<StatsPart<T>> {
    try {
      return { available: true, ...(await build()) };
    } catch (err) {
      this.logger.error(`Stats part ${name} failed: ${String(err)}`);
      return { available: false };
    }
  }

  private loaders(resolved: ResolvedPeriod, compare: boolean): Loaders {
    return {
      current: once(() => this.summary(resolved.fromTs, resolved.toTs)),
      series: once(() => this.series(resolved)),
      previous: once(() =>
        compare
          ? this.summary(resolved.previousFromTs, resolved.previousToTs)
          : Promise.resolve(null),
      ),
      resolved,
    };
  }

  private async buildGrowth(loaders: Loaders) {
    const [row, series, previous] = await Promise.all([
      loaders.current(),
      loaders.series(),
      loaders.previous(),
    ]);
    return {
      noData: this.isBeforeFirstUser(row, loaders.resolved),
      totalUsers: num(row.o_total_users),
      totals: growthTotals(row),
      previous: previous ? growthTotals(previous) : null,
      series,
    };
  }

  private async buildUsage(loaders: Loaders) {
    const [row, series, previous] = await Promise.all([
      loaders.current(),
      loaders.series(),
      loaders.previous(),
    ]);
    return {
      noData: this.isBeforeFirstUser(row, loaders.resolved),
      totals: usageTotals(row),
      previous: previous ? usageTotals(previous) : null,
      series,
    };
  }

  private async buildPlans() {
    const { data, error } = await this.supabase.rpc('admin_stats_plans');
    if (error) throw new InternalServerErrorException(error.message);
    const rows = (data ?? []) as {
      o_plan_name: string;
      o_count: number | string;
    }[];
    return {
      plans: rows.map((row) => ({
        name: row.o_plan_name,
        count: num(row.o_count),
      })),
    };
  }

  private isBeforeFirstUser(
    row: SummaryRow,
    resolved: ResolvedPeriod,
  ): boolean {
    if (!row.o_first_user_at) return true;
    return Date.parse(resolved.toTs) <= Date.parse(row.o_first_user_at);
  }

  private async summary(fromTs: string, toTs: string): Promise<SummaryRow> {
    const { data, error } = await this.supabase.rpc('admin_stats_summary', {
      p_from: fromTs,
      p_to: toTs,
    });
    if (error) {
      this.logger.error(`admin_stats_summary failed: ${error.message}`);
      throw new InternalServerErrorException('Could not compute statistics');
    }
    const row = (data as SummaryRow[] | null)?.[0];
    if (!row)
      throw new InternalServerErrorException('Could not compute statistics');
    return row;
  }

  private async series(resolved: ResolvedPeriod): Promise<StatsSeriesPoint[]> {
    const { data, error } = await this.supabase.rpc('admin_stats_series', {
      p_from: resolved.fromTs,
      p_to: resolved.toTs,
      p_bucket: resolved.period.granularity,
    });
    if (error) {
      this.logger.error(`admin_stats_series failed: ${error.message}`);
      throw new InternalServerErrorException('Could not compute statistics');
    }
    return ((data ?? []) as SeriesRow[]).map((row) => ({
      date: row.o_bucket,
      newUsers: num(row.o_new_users),
      activeUsers: num(row.o_active_users),
      newProjects: num(row.o_new_projects),
      commits: num(row.o_commits),
      newBranches: num(row.o_branches),
      merges: num(row.o_merges),
      forks: num(row.o_forks),
      pullRequests: num(row.o_pull_requests),
    }));
  }
}
