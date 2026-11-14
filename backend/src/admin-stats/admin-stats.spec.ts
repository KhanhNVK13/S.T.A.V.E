import { BadRequestException } from '@nestjs/common';
import { STATS_MAX_RANGE_DAYS } from '@stave/shared-types';
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

describe('BE-STA-04 resolvePeriod(from, to, now)', () => {
  it('UTCID01 mặc định 30 ngày kết thúc hôm nay (UTC), gộp theo ngày', () => {
    const { period, fromTs, toTs } = resolvePeriod(undefined, undefined, NOW);
    expect(period).toEqual({
      from: '2026-10-14',
      to: '2026-11-12',
      granularity: 'day',
    });
    expect(fromTs).toBe('2026-10-14T00:00:00.000Z');
    expect(toTs).toBe('2026-11-13T00:00:00.000Z');
  });

  it('UTCID02 ranh giới gộp: đến 31 ngày theo ngày, đến 180 theo tuần, dài hơn theo tháng', () => {
    expect(granularityFor(31)).toBe('day');
    expect(granularityFor(32)).toBe('week');
    expect(granularityFor(180)).toBe('week');
    expect(granularityFor(181)).toBe('month');
  });

  it('UTCID03 kỳ trước có cùng độ dài và liền ngay trước', () => {
    const r = resolvePeriod('2026-11-01', '2026-11-10', NOW);
    expect(r.previousFromTs).toBe('2026-10-22T00:00:00.000Z');
    expect(r.previousToTs).toBe('2026-11-01T00:00:00.000Z');
  });

  it('UTCID04 từ chối kỳ đảo ngược, ngày sai và kỳ quá dài', () => {
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

  it('UTCID05 kỳ một ngày (từ bằng đến) được chấp nhận và gộp theo ngày', () => {
    const r = resolvePeriod('2026-11-05', '2026-11-05', NOW);
    expect(r.period).toEqual({
      from: '2026-11-05',
      to: '2026-11-05',
      granularity: 'day',
    });
    expect(r.fromTs).toBe('2026-11-05T00:00:00.000Z');
    expect(r.toTs).toBe('2026-11-06T00:00:00.000Z');
  });

  it('UTCID06 kỳ dài đúng mức tối đa được chấp nhận, thêm một ngày thì bị từ chối', () => {
    const DAY = 86_400_000;
    const to = '2026-11-12';
    const fromOk = new Date(Date.parse(to) - (STATS_MAX_RANGE_DAYS - 1) * DAY)
      .toISOString()
      .slice(0, 10);
    const fromTooLong = new Date(Date.parse(to) - STATS_MAX_RANGE_DAYS * DAY)
      .toISOString()
      .slice(0, 10);
    expect(resolvePeriod(fromOk, to, NOW).period.granularity).toBe('month');
    expect(() => resolvePeriod(fromTooLong, to, NOW)).toThrow(
      BadRequestException,
    );
  });
});

describe('BE-STA-01 AdminStatsService.growth', () => {
  it('UTCID01 đổi chuỗi số của RPC thành số, lấy chuỗi theo kỳ', async () => {
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

  it('UTCID02 compare=true trả thêm số liệu của kỳ trước', async () => {
    const { service, mock } = build({
      admin_stats_summary: {
        data: [summaryRow({ o_new_users: '5', o_active_users: '4' })],
        error: null,
      },
      admin_stats_series: { data: [], error: null },
    });
    const result = await service.growth('2026-11-01', '2026-11-10', true);
    expect(result.previous).toEqual({ newUsers: 5, activeUsers: 4 });
    const calls = mock.rpc.mock.calls.filter(
      (c: unknown[]) => c[0] === 'admin_stats_summary',
    );
    expect(calls).toHaveLength(2);
  });

  it('UTCID03 kỳ nằm hoàn toàn trước tài khoản đầu tiên: noData, không phải số 0', async () => {
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

  it('UTCID04 chưa có người dùng nào cũng là noData', async () => {
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

  it('UTCID05 lỗi RPC tổng hợp thì ném lỗi, không trả tổng có thể sai', async () => {
    const { service } = build({
      admin_stats_summary: { data: null, error: { message: 'boom' } },
      admin_stats_series: { data: [], error: null },
    });
    await expect(
      service.growth('2026-11-01', '2026-11-10', false),
    ).rejects.toThrow('Could not compute statistics');
  });

  it('UTCID06 lỗi RPC chuỗi theo kỳ thì ném lỗi', async () => {
    const { service } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
      admin_stats_series: { data: null, error: { message: 'boom' } },
    });
    await expect(
      service.growth('2026-11-01', '2026-11-10', false),
    ).rejects.toThrow('Could not compute statistics');
  });

  it('UTCID07 RPC tổng hợp không trả dòng nào thì ném lỗi', async () => {
    const { service } = build({
      admin_stats_summary: { data: [], error: null },
      admin_stats_series: { data: [], error: null },
    });
    await expect(
      service.growth('2026-11-01', '2026-11-10', false),
    ).rejects.toThrow('Could not compute statistics');
  });

  it('UTCID08 kỳ dài hơn thì gộp theo khoảng thô hơn khi gọi RPC chuỗi', async () => {
    const { service, mock } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
      admin_stats_series: { data: [], error: null },
    });
    const result = await service.growth('2026-06-01', '2026-11-10', false);
    expect(result.period.granularity).toBe('week');
    expect(mock.rpc).toHaveBeenCalledWith(
      'admin_stats_series',
      expect.objectContaining({ p_bucket: 'week' }),
    );
  });

  it('UTCID09 kỳ đảo ngược thì 400 và không gọi RPC', async () => {
    const { service, mock } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
      admin_stats_series: { data: [], error: null },
    });
    await expect(
      service.growth('2026-11-10', '2026-11-01', false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe('BE-STA-02 AdminStatsService.usage', () => {
  it('UTCID01 trả số dự án, commit, nhánh, hợp nhất, fork và pull request của kỳ', async () => {
    const { service } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
      admin_stats_series: { data: [seriesRow], error: null },
    });
    const result = await service.usage('2026-11-01', '2026-11-10', false);
    expect(result.totals).toEqual({
      newProjects: 4,
      commits: 30,
      newBranches: 5,
      merges: 3,
      forks: 1,
      pullRequests: 0,
    });
    expect(result.series[0]).toMatchObject({ commits: 7, newProjects: 0 });
    expect(result.previous).toBeNull();
  });

  it('UTCID02 compare=true gọi thêm kỳ trước', async () => {
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

  it('UTCID03 compare=false chỉ gọi tổng hợp một lần', async () => {
    const { service, mock } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
      admin_stats_series: { data: [], error: null },
    });
    await service.usage('2026-11-01', '2026-11-10', false);
    const calls = mock.rpc.mock.calls.filter(
      (c: unknown[]) => c[0] === 'admin_stats_summary',
    );
    expect(calls).toHaveLength(1);
  });

  it('UTCID04 kỳ trước nền tảng thì noData thay vì số 0', async () => {
    const { service } = build({
      admin_stats_summary: {
        data: [summaryRow({ o_first_user_at: '2026-09-03T00:00:00Z' })],
        error: null,
      },
      admin_stats_series: { data: [], error: null },
    });
    expect(
      (await service.usage('2026-08-01', '2026-08-31', false)).noData,
    ).toBe(true);
  });

  it('UTCID05 lỗi RPC thì ném lỗi, không trả số đếm có thể sai', async () => {
    const { service } = build({
      admin_stats_summary: { data: null, error: { message: 'boom' } },
      admin_stats_series: { data: [], error: null },
    });
    await expect(
      service.usage('2026-11-01', '2026-11-10', false),
    ).rejects.toThrow('Could not compute statistics');
  });
});

describe('BE-STA-03 AdminStatsService.overview', () => {
  it('UTCID01 phần lỗi chỉ báo available=false, các phần khác vẫn có', async () => {
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

  it('UTCID02 cơ cấu gói', async () => {
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

  it('UTCID03 đủ các phần thì mọi phần có số liệu của kỳ', async () => {
    const { service } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
      admin_stats_series: { data: [seriesRow], error: null },
      admin_stats_plans: { data: [], error: null },
    });
    const result = await service.overview('2026-11-01', '2026-11-10', false);
    expect(result.period).toEqual({
      from: '2026-11-01',
      to: '2026-11-10',
      granularity: 'day',
    });
    expect(result.growth).toMatchObject({ available: true, totalUsers: 23 });
    expect(result.usage).toMatchObject({ available: true });
    expect(result.usage.available && result.usage.totals.commits).toBe(30);
    expect(result.plans).toEqual({ available: true, plans: [] });
  });

  it('UTCID04 tổng hợp lỗi thì các phần dựa vào nó báo available=false, không trả số 0', async () => {
    const { service } = build({
      admin_stats_summary: { data: null, error: { message: 'boom' } },
      admin_stats_series: { data: [], error: null },
      admin_stats_plans: { data: [], error: null },
    });
    const result = await service.overview('2026-11-01', '2026-11-10', false);
    expect(result.growth).toEqual({ available: false });
    expect(result.usage).toEqual({ available: false });
    expect(result.finance).toEqual({ available: false });
    expect(result.moderation).toEqual({ available: false });
    expect(result.plans).toEqual({ available: true, plans: [] });
  });

  it('UTCID05 kỳ không hợp lệ thì 400 và không gọi RPC', async () => {
    const { service, mock } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
    });
    await expect(
      service.overview('2026-11-10', '2026-11-01', false),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('UTCID06 không truyền kỳ thì dùng 30 ngày gần nhất', async () => {
    const { service } = build({
      admin_stats_summary: { data: [summaryRow()], error: null },
      admin_stats_series: { data: [], error: null },
      admin_stats_plans: { data: [], error: null },
    });
    const result = await service.overview(undefined, undefined, false);
    const days =
      (Date.parse(result.period.to) - Date.parse(result.period.from)) /
        86_400_000 +
      1;
    expect(days).toBe(30);
  });
});
