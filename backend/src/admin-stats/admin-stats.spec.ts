import { BadRequestException } from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { AdminStatsService } from './admin-stats.service';
import { granularityFor, resolvePeriod } from './admin-stats.logic';

const NOW = Date.parse('2026-11-12T15:00:00Z');

const summaryRow = (over: Record<string, unknown> = {}) => ({
  o_total_users: '23',
  o_first_user_at: '2026-09-03T16:50:00Z',
  o_new_users: '13',
  o_active_users: '9',
  o_projects: '4',
  o_commits: '30',
  o_branches: '5',
  o_merges: '3',
  o_forks: '1',
  o_pull_requests: '0',
  o_revenue_vnd: '98000',
  o_failed_transactions: '2',
  o_open_reports: '1',
  o_open_payment_issues: '0',
  ...over,
});

const seriesRow = {
  o_bucket: '2026-11-02T00:00:00Z',
  o_new_users: '1',
  o_active_users: '2',
  o_new_projects: '0',
  o_commits: '7',
  o_branches: '1',
  o_merges: '0',
  o_forks: '0',
  o_pull_requests: '0',
};

function build(rpc: Record<string, unknown>) {
  const repeated = Object.fromEntries(
    Object.entries(rpc).map(([name, result]) => [
      name,
      Array.from({ length: 8 }, () => result),
    ]),
  );
  const mock = createSupabaseMock([], { rpc: repeated as never });
  return { mock, service: new AdminStatsService(mock.client) };
}

describe('resolvePeriod', () => {
  it('mặc định 30 ngày kết thúc hôm nay (UTC), gộp theo ngày... hoặc tuần', () => {
    const { period, fromTs, toTs } = resolvePeriod(undefined, undefined, NOW);
    expect(period).toEqual({
      from: '2026-10-14',
      to: '2026-11-12',
      granularity: 'day',
    });
    expect(fromTs).toBe('2026-10-14T00:00:00.000Z');
    expect(toTs).toBe('2026-11-13T00:00:00.000Z');
  });

  it('ranh giới gộp: đến 31 ngày theo ngày, đến 180 theo tuần, dài hơn theo tháng', () => {
    expect(granularityFor(31)).toBe('day');
    expect(granularityFor(32)).toBe('week');
    expect(granularityFor(180)).toBe('week');
    expect(granularityFor(181)).toBe('month');
  });

  it('kỳ trước có cùng độ dài và liền ngay trước', () => {
    const r = resolvePeriod('2026-11-01', '2026-11-10', NOW);
    expect(r.previousFromTs).toBe('2026-10-22T00:00:00.000Z');
    expect(r.previousToTs).toBe('2026-11-01T00:00:00.000Z');
  });

  it('từ chối kỳ đảo ngược, ngày sai và kỳ quá dài', () => {
    expect(() => resolvePeriod('2026-11-10', '2026-11-01', NOW)).toThrow(
      BadRequestException,
    );
    expect(() => resolvePeriod('2026-13-45', '2026-11-01', NOW)).toThrow(
      BadRequestException,
    );
    expect(() => resolvePeriod('2020-01-01', '2026-11-01', NOW)).toThrow(
      BadRequestException,
    );
  });
});

describe('AdminStatsService', () => {
  it('growth: đổi chuỗi số của RPC thành số, lấy chuỗi theo kỳ', async () => {
    const { service } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
      admin_stats_series: { data: [seriesRow], error: null },
    });
    const result = await service.growth('2026-11-01', '2026-11-10', false);
    expect(result.totalUsers).toBe(23);
    expect(result.totals).toEqual({ newUsers: 13, activeUsers: 9 });
    expect(result.previous).toBeNull();
    expect(result.series[0]).toMatchObject({ newUsers: 1, commits: 7 });
    expect(result.noData).toBe(false);
  });

  it('compare=true gọi thêm kỳ trước', async () => {
    const { service, mock } = build({
      admin_stats_summary: {
        data: [summaryRow({ o_new_users: '5' })],
        error: null,
      },
      admin_stats_series: { data: [], error: null },
    });
    const result = await service.usage('2026-11-01', '2026-11-10', true);
    expect(result.previous).not.toBeNull();
    const calls = mock.rpc.mock.calls.filter(
      (c: unknown[]) => c[0] === 'admin_stats_summary',
    );
    expect(calls).toHaveLength(2);
  });

  it('kỳ nằm hoàn toàn trước tài khoản đầu tiên: noData, không phải số 0', async () => {
    const { service } = build({
      admin_stats_summary: {
        data: [summaryRow({ o_first_user_at: '2026-09-03T00:00:00Z' })],
        error: null,
      },
      admin_stats_series: { data: [], error: null },
    });
    const result = await service.growth('2026-08-01', '2026-08-31', false);
    expect(result.noData).toBe(true);
  });

  it('chưa có người dùng nào cũng là noData', async () => {
    const { service } = build({
      admin_stats_summary: {
        data: [summaryRow({ o_first_user_at: null })],
        error: null,
      },
      admin_stats_series: { data: [], error: null },
    });
    expect((await service.growth(undefined, undefined, false)).noData).toBe(
      true,
    );
  });

  it('growth lỗi RPC thì ném lỗi, không trả tổng có thể sai', async () => {
    const { service } = build({
      admin_stats_summary: { data: null, error: { message: 'boom' } },
      admin_stats_series: { data: [], error: null },
    });
    await expect(
      service.growth('2026-11-01', '2026-11-10', false),
    ).rejects.toThrow('Could not compute statistics');
  });

  it('overview: phần lỗi chỉ báo available=false, các phần khác vẫn có', async () => {
    const { service } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
      admin_stats_series: { data: [seriesRow], error: null },
      admin_stats_plans: { data: null, error: { message: 'boom' } },
    });
    const result = await service.overview('2026-11-01', '2026-11-10', false);
    expect(result.plans).toEqual({ available: false });
    expect(result.growth.available).toBe(true);
    expect(result.finance).toEqual({
      available: true,
      revenueVnd: 98000,
      failedTransactions: 2,
    });
    expect(result.moderation).toEqual({
      available: true,
      openReports: 1,
      openPaymentIssues: 0,
    });
  });

  it('overview: cơ cấu gói', async () => {
    const { service } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
      admin_stats_series: { data: [], error: null },
      admin_stats_plans: {
        data: [
          { o_plan_name: 'Free', o_count: '20' },
          { o_plan_name: 'STAVE+', o_count: '3' },
        ],
        error: null,
      },
    });
    const result = await service.overview('2026-11-01', '2026-11-10', false);
    expect(result.plans).toEqual({
      available: true,
      plans: [
        { name: 'Free', count: 20 },
        { name: 'STAVE+', count: 3 },
      ],
    });
  });
});
