import {
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { AdminReportsService } from './admin-reports.service';
import type { PlatformSettingsService } from '../platform-settings/platform-settings.service';

const P1 = '33333333-3333-4333-8333-333333333333';
const P2 = '55555555-5555-4555-8555-555555555555';
const OWNER1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REPORTER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const ok = (data: unknown, extra: Partial<QueryResult> = {}): QueryResult => ({
  data,
  error: null,
  ...extra,
});

interface Setup {
  rpc?: QueryResult | QueryResult[];
  tables?: Record<string, QueryResult[]>;
  retentionDays?: number;
}

function build({ rpc, tables = {}, retentionDays = 30 }: Setup = {}) {
  const mock = createSupabaseMock([], {
    tables,
    rpc: rpc ? { admin_report_groups: rpc } : undefined,
  });
  const getSetting = jest.fn().mockResolvedValue(retentionDays);
  const platformSettings = {
    get: getSetting,
  } as unknown as PlatformSettingsService;
  return {
    mock,
    service: new AdminReportsService(mock.client, platformSettings),
    getSetting,
  };
}

const touched = (mock: ReturnType<typeof build>['mock'], table: string) =>
  (mock.client.from as jest.Mock).mock.calls.filter(
    (call: unknown[]) => call[0] === table,
  ).length;

const groupRow = (over: Record<string, unknown> = {}) => ({
  project_id: P1,
  report_count: 2,
  latest_at: '2026-11-03T10:00:00.000Z',
  reasons: [
    { reason: 'spam', count: 1 },
    { reason: 'copyright', count: 1 },
  ],
  resolution: null,
  resolution_note: null,
  resolved_at: null,
  total_groups: '2',
  ...over,
});

describe('AdminReportsService.listGroups', () => {
  it('open: gọi RPC với status pending, không có resolution', async () => {
    const { service, mock } = build({
      rpc: ok([]),
    });
    await service.listGroups({ status: 'open', page: 1, limit: 20 });
    expect(mock.rpc).toHaveBeenCalledWith('admin_report_groups', {
      p_status: 'pending',
      p_resolution: null,
      p_limit: 20,
      p_offset: 0,
    });
  });

  it.each([
    ['upheld', 'upheld'],
    ['dismissed', 'dismissed'],
  ] as const)(
    '%s: truyền status resolved và resolution tương ứng',
    async (status, resolution) => {
      const { service, mock } = build({ rpc: ok([]) });
      await service.listGroups({ status, page: 1, limit: 20 });
      expect(mock.rpc).toHaveBeenCalledWith(
        'admin_report_groups',
        expect.objectContaining({
          p_status: 'resolved',
          p_resolution: resolution,
        }),
      );
    },
  );

  it('offset = (page-1)*limit', async () => {
    const { service, mock } = build({
      rpc: ok([groupRow()]),
      tables: {
        projects: [ok([{ id: P1, name: 'A', owner_id: OWNER1 }])],
        users: [ok([{ id: OWNER1, display_name: 'Alice' }])],
      },
    });
    await service.listGroups({ status: 'open', page: 3, limit: 10 });
    expect(mock.rpc).toHaveBeenCalledWith(
      'admin_report_groups',
      expect.objectContaining({ p_limit: 10, p_offset: 20 }),
    );
  });

  it('ghép tên dự án và display_name của chủ; total ép số một lần', async () => {
    const { service } = build({
      rpc: ok([
        groupRow(),
        groupRow({ project_id: P2, report_count: 1, total_groups: '2' }),
      ]),
      tables: {
        projects: [
          ok([
            { id: P1, name: 'Song A', owner_id: OWNER1 },
            { id: P2, name: 'Song B', owner_id: OWNER2 },
          ]),
        ],
        users: [
          ok([
            { id: OWNER1, display_name: 'Alice' },
            { id: OWNER2, display_name: null },
          ]),
        ],
      },
    });
    const result = await service.listGroups({
      status: 'open',
      page: 1,
      limit: 20,
    });
    expect(result.total).toBe(2);
    expect(typeof result.total).toBe('number');
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.items[0]).toEqual({
      projectId: P1,
      projectName: 'Song A',
      projectExists: true,
      ownerDisplayName: 'Alice',
      reportCount: 2,
      reasons: [
        { reason: 'spam', count: 1 },
        { reason: 'copyright', count: 1 },
      ],
      latestAt: '2026-11-03T10:00:00.000Z',
    });
    expect(result.items[1].ownerDisplayName).toBeNull();
  });

  it('thứ tự nhóm giữ nguyên thứ tự RPC, mỗi nhóm một dự án (không trộn)', async () => {
    const { service } = build({
      rpc: ok([
        groupRow({ project_id: P2, report_count: 1 }),
        groupRow({ project_id: P1, report_count: 5 }),
      ]),
      tables: {
        projects: [
          ok([
            { id: P1, name: 'A', owner_id: OWNER1 },
            { id: P2, name: 'B', owner_id: OWNER1 },
          ]),
        ],
        users: [ok([{ id: OWNER1, display_name: 'Alice' }])],
      },
    });
    const { items } = await service.listGroups({
      status: 'open',
      page: 1,
      limit: 20,
    });
    expect(items.map((i) => i.projectId)).toEqual([P2, P1]);
    expect(items.map((i) => i.reportCount)).toEqual([1, 5]);
    expect(new Set(items.map((i) => i.projectId)).size).toBe(items.length);
  });

  it('chỉ tra dự án và chủ của đúng các nhóm trong trang', async () => {
    const { service, mock } = build({
      rpc: ok([groupRow()]),
      tables: {
        projects: [ok([{ id: P1, name: 'A', owner_id: OWNER1 }])],
        users: [ok([{ id: OWNER1, display_name: 'Alice' }])],
      },
    });
    await service.listGroups({ status: 'open', page: 1, limit: 20 });
    expect(mock.builders.projects.in).toHaveBeenCalledWith('id', [P1]);
    expect(mock.builders.users.in).toHaveBeenCalledWith('id', [OWNER1]);
    expect(mock.builders.users.select).toHaveBeenCalledWith('id, display_name');
  });

  it('không bao giờ chọn email hay chạm bảng reports', async () => {
    const { service, mock } = build({
      rpc: ok([groupRow()]),
      tables: {
        projects: [ok([{ id: P1, name: 'A', owner_id: OWNER1 }])],
        users: [ok([{ id: OWNER1, display_name: 'Alice' }])],
      },
    });
    const result = await service.listGroups({
      status: 'open',
      page: 1,
      limit: 20,
    });
    expect(JSON.stringify(result)).not.toMatch(/email|reporter/i);
    expect(touched(mock, 'reports')).toBe(0);
    for (const call of mock.builders.users.select.mock.calls) {
      expect(String(call[0])).not.toContain('email');
    }
  });

  it('nhóm project_id null đánh dấu projectExists false và không tra dự án', async () => {
    const { service, mock } = build({
      rpc: ok([groupRow({ project_id: null, report_count: 3 })]),
    });
    const { items } = await service.listGroups({
      status: 'open',
      page: 1,
      limit: 20,
    });
    expect(items[0]).toMatchObject({
      projectId: null,
      projectName: null,
      projectExists: false,
      ownerDisplayName: null,
      reportCount: 3,
    });
    expect(touched(mock, 'projects')).toBe(0);
    expect(touched(mock, 'users')).toBe(0);
  });

  it('dự án không còn trong bảng projects -> projectExists false', async () => {
    const { service } = build({
      rpc: ok([groupRow()]),
      tables: { projects: [ok([])] },
    });
    const { items } = await service.listGroups({
      status: 'open',
      page: 1,
      limit: 20,
    });
    expect(items[0]).toMatchObject({
      projectId: P1,
      projectExists: false,
      projectName: null,
    });
  });

  it('tab đã xử lý trả resolution, resolutionNote, resolvedAt', async () => {
    const { service } = build({
      rpc: ok([
        groupRow({
          resolution: 'upheld',
          resolution_note: 'Vi phạm bản quyền',
          resolved_at: '2026-11-04T00:00:00.000Z',
        }),
      ]),
      tables: {
        projects: [ok([{ id: P1, name: 'A', owner_id: OWNER1 }])],
        users: [ok([{ id: OWNER1, display_name: 'Alice' }])],
      },
    });
    const { items } = await service.listGroups({
      status: 'upheld',
      page: 1,
      limit: 20,
    });
    expect(items[0]).toMatchObject({
      resolution: 'upheld',
      resolutionNote: 'Vi phạm bản quyền',
      resolvedAt: '2026-11-04T00:00:00.000Z',
    });
  });

  it('tab đang mở không có trường quyết định', async () => {
    const { service } = build({
      rpc: ok([groupRow()]),
      tables: {
        projects: [ok([{ id: P1, name: 'A', owner_id: OWNER1 }])],
        users: [ok([{ id: OWNER1, display_name: 'Alice' }])],
      },
    });
    const { items } = await service.listGroups({
      status: 'open',
      page: 1,
      limit: 20,
    });
    expect(items[0]).not.toHaveProperty('resolution');
    expect(items[0]).not.toHaveProperty('resolutionNote');
  });

  it('lý do ngoài danh mục từ RPC được tính là other', async () => {
    const { service } = build({
      rpc: ok([groupRow({ reasons: [{ reason: 'weird', count: 2 }] })]),
      tables: {
        projects: [ok([{ id: P1, name: 'A', owner_id: OWNER1 }])],
        users: [ok([{ id: OWNER1, display_name: 'A' }])],
      },
    });
    const { items } = await service.listGroups({
      status: 'open',
      page: 1,
      limit: 20,
    });
    expect(items[0].reasons).toEqual([{ reason: 'other', count: 2 }]);
  });

  it('không có nhóm nào -> items rỗng, total 0 (trang đầu)', async () => {
    const { service } = build({ rpc: ok([]) });
    await expect(
      service.listGroups({ status: 'open', page: 1, limit: 20 }),
    ).resolves.toEqual({ items: [], total: 0, page: 1, limit: 20 });
  });

  it('trang vượt cuối: items rỗng nhưng total vẫn đúng (hỏi lại trang đầu)', async () => {
    const { service, mock } = build({
      rpc: [ok([]), ok([groupRow({ total_groups: '7' })])],
      tables: {
        projects: [ok([{ id: P1, name: 'A', owner_id: OWNER1 }])],
        users: [ok([{ id: OWNER1, display_name: 'A' }])],
      },
    });
    const result = await service.listGroups({
      status: 'open',
      page: 9,
      limit: 20,
    });
    expect(result).toEqual({ items: [], total: 7, page: 9, limit: 20 });
    expect(mock.rpc).toHaveBeenNthCalledWith(
      2,
      'admin_report_groups',
      expect.objectContaining({ p_limit: 1, p_offset: 0 }),
    );
  });

  it('RPC lỗi (chưa áp migration) -> 500, không trả danh sách rỗng giả', async () => {
    const { service } = build({
      rpc: {
        data: null,
        error: { message: 'function admin_report_groups does not exist' },
      },
    });
    await expect(
      service.listGroups({ status: 'open', page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('lỗi tra dự án -> 500', async () => {
    const { service } = build({
      rpc: ok([groupRow()]),
      tables: { projects: [{ data: null, error: { message: 'boom' } }] },
    });
    await expect(
      service.listGroups({ status: 'open', page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('lỗi tra chủ dự án -> 500', async () => {
    const { service } = build({
      rpc: ok([groupRow()]),
      tables: {
        projects: [ok([{ id: P1, name: 'A', owner_id: OWNER1 }])],
        users: [{ data: null, error: { message: 'boom' } }],
      },
    });
    await expect(
      service.listGroups({ status: 'open', page: 1, limit: 20 }),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
  });

  it('tab Đã gỡ (upheld): dự án bị ẩn trả hiddenAt/retainedUntil/restorable; tab khác không trả', async () => {
    const { service, getSetting } = build({
      rpc: ok([
        groupRow({ resolution: 'upheld', resolution_note: 'copyright' }),
      ]),
      tables: {
        projects: [
          ok([
            {
              id: P1,
              name: 'A',
              owner_id: OWNER1,
              moderation_hidden_at: '2026-11-01T00:00:00.000Z',
            },
          ]),
        ],
        users: [ok([{ id: OWNER1, display_name: 'Alice' }])],
      },
      retentionDays: 30,
    });
    const { items } = await service.listGroups({
      status: 'upheld',
      page: 1,
      limit: 20,
    });
    expect(getSetting).toHaveBeenCalledWith('moderation_retention_days', 30);
    expect(items[0]).toMatchObject({
      hiddenAt: '2026-11-01T00:00:00.000Z',
      retainedUntil: '2026-12-01T00:00:00.000Z',
    });
    // now (2026-11) is within 30 days of 2026-11-01 -> restorable true.
    expect(items[0].restorable).toBe(true);

    // A project with no hiddenAt in the upheld tab keeps no retention fields.
    const noHidden = build({
      rpc: ok([groupRow({ resolution: 'upheld' })]),
      tables: {
        projects: [
          ok([
            { id: P1, name: 'A', owner_id: OWNER1, moderation_hidden_at: null },
          ]),
        ],
        users: [ok([{ id: OWNER1, display_name: 'Alice' }])],
      },
      retentionDays: 30,
    });
    const noHiddenItems = await noHidden.service.listGroups({
      status: 'upheld',
      page: 1,
      limit: 20,
    });
    expect(noHiddenItems.items[0]).not.toHaveProperty('hiddenAt');

    // The open tab never reads the retention setting nor populates the fields.
    const open = build({
      rpc: ok([groupRow()]),
      tables: {
        projects: [
          ok([
            {
              id: P1,
              name: 'A',
              owner_id: OWNER1,
              moderation_hidden_at: '2026-11-01T00:00:00.000Z',
            },
          ]),
        ],
        users: [ok([{ id: OWNER1, display_name: 'Alice' }])],
      },
      retentionDays: 30,
    });
    const openItems = await open.service.listGroups({
      status: 'open',
      page: 1,
      limit: 20,
    });
    expect(open.getSetting).not.toHaveBeenCalled();
    expect(openItems.items[0]).not.toHaveProperty('hiddenAt');
    expect(openItems.items[0]).not.toHaveProperty('restorable');
  });
});

describe('AdminReportsService.getDetails', () => {
  const reportRow = (over: Record<string, unknown> = {}) => ({
    id: 'r1',
    reason: 'copyright',
    details: 'giống bài X',
    created_at: '2026-11-02T10:00:00.000Z',
    status: 'pending',
    resolution: null,
    reporter_id: REPORTER,
    ...over,
  });

  it('trả reporter {id, displayName} duy nhất ở endpoint này', async () => {
    const { service } = build({
      tables: {
        reports: [ok([reportRow()])],
        users: [ok([{ id: REPORTER, display_name: 'Bob' }])],
      },
    });
    const details = await service.getDetails(P1, 'open');
    expect(details).toEqual([
      {
        id: 'r1',
        reason: 'copyright',
        details: 'giống bài X',
        createdAt: '2026-11-02T10:00:00.000Z',
        reporter: { id: REPORTER, displayName: 'Bob' },
        status: 'pending',
        resolution: null,
      },
    ]);
  });

  it('không bao giờ chọn hay trả email', async () => {
    const { service, mock } = build({
      tables: {
        reports: [ok([reportRow()])],
        users: [ok([{ id: REPORTER, display_name: 'Bob' }])],
      },
    });
    const details = await service.getDetails(P1, 'open');
    expect(JSON.stringify(details)).not.toContain('email');
    expect(mock.builders.users.select).toHaveBeenCalledWith('id, display_name');
  });

  it('reporter null (tài khoản đã xoá) -> reporter null và không tra users', async () => {
    const { service, mock } = build({
      tables: { reports: [ok([reportRow({ reporter_id: null })])] },
    });
    const [detail] = await service.getDetails(P1, 'open');
    expect(detail.reporter).toBeNull();
    expect(touched(mock, 'users')).toBe(0);
  });

  it('người báo cáo còn id nhưng không tìm thấy hồ sơ -> displayName null', async () => {
    const { service } = build({
      tables: { reports: [ok([reportRow()])], users: [ok([])] },
    });
    const [detail] = await service.getDetails(P1, 'open');
    expect(detail.reporter).toEqual({ id: REPORTER, displayName: null });
  });

  it('open lọc status pending, không lọc resolution', async () => {
    const { service, mock } = build({ tables: { reports: [ok([])] } });
    await service.getDetails(P1, 'open');
    expect(mock.builders.reports.eq).toHaveBeenCalledWith('project_id', P1);
    expect(mock.builders.reports.eq).toHaveBeenCalledWith('status', 'pending');
    expect(mock.builders.reports.eq).not.toHaveBeenCalledWith(
      'resolution',
      expect.anything(),
    );
  });

  it('dismissed lọc status resolved và resolution dismissed', async () => {
    const { service, mock } = build({ tables: { reports: [ok([])] } });
    await service.getDetails(P1, 'dismissed');
    expect(mock.builders.reports.eq).toHaveBeenCalledWith('status', 'resolved');
    expect(mock.builders.reports.eq).toHaveBeenCalledWith(
      'resolution',
      'dismissed',
    );
  });

  it('giới hạn 500 báo cáo mỗi nhóm, mới nhất trước', async () => {
    const { service, mock } = build({ tables: { reports: [ok([])] } });
    await service.getDetails(P1, 'open');
    expect(mock.builders.reports.range).toHaveBeenCalledWith(0, 499);
    expect(mock.builders.reports.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('nhóm không có báo cáo -> mảng rỗng và không tra users', async () => {
    const { service, mock } = build({ tables: { reports: [ok([])] } });
    await expect(service.getDetails(P1, 'open')).resolves.toEqual([]);
    expect(touched(mock, 'users')).toBe(0);
  });

  it('lý do ngoài danh mục là other; báo cáo đã xử lý mang resolution', async () => {
    const { service } = build({
      tables: {
        reports: [
          ok([
            reportRow({
              reason: 'weird',
              status: 'resolved',
              resolution: 'upheld',
            }),
          ]),
        ],
        users: [ok([{ id: REPORTER, display_name: 'Bob' }])],
      },
    });
    const [detail] = await service.getDetails(P1, 'upheld');
    expect(detail.reason).toBe('other');
    expect(detail.status).toBe('resolved');
    expect(detail.resolution).toBe('upheld');
  });

  it('lỗi đọc báo cáo -> 500', async () => {
    const { service } = build({
      tables: { reports: [{ data: null, error: { message: 'boom' } }] },
    });
    await expect(service.getDetails(P1, 'open')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('lỗi tra người báo cáo -> 500', async () => {
    const { service } = build({
      tables: {
        reports: [ok([reportRow()])],
        users: [{ data: null, error: { message: 'boom' } }],
      },
    });
    await expect(service.getDetails(P1, 'open')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});

describe('AdminReportsService.getPreview', () => {
  const project = {
    id: P1,
    name: 'Song A',
    description: 'desc',
    genre: 'Pop',
  };
  const snapshot = {
    schemaVersion: 3,
    meta: { tempo: 120 },
    tracks: [
      { id: 't1', name: 'Lead', instrument: 'Flute', color: '#fff' },
      { id: 't2', name: 'Bass', instrument: null, color: '#000' },
    ],
    notes: [
      {
        id: 'n1',
        trackId: 't1',
        pitch: 60,
        start: 0,
        duration: 4,
        velocity: 90,
      },
      {
        id: 'n2',
        trackId: 't1',
        pitch: 64,
        start: 4,
        duration: 4,
        velocity: 90,
      },
      {
        id: 'n3',
        trackId: 't2',
        pitch: 36,
        start: 0,
        duration: 4,
        velocity: 90,
      },
    ],
  };

  const full = (): Setup['tables'] => ({
    projects: [ok(project)],
    reports: [ok(null, { count: 2 })],
    branches: [ok({ head_commit_id: 'c1' })],
    commits: [ok({ snapshot })],
  });

  it('dự án không tồn tại -> 404 và không đọc báo cáo, nhánh, commit', async () => {
    const { service, mock } = build({ tables: { projects: [ok(null)] } });
    await expect(service.getPreview(P1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(touched(mock, 'reports')).toBe(0);
    expect(touched(mock, 'commits')).toBe(0);
  });

  it('không có báo cáo pending -> 403, không đọc nhánh, commit hay draft', async () => {
    const { service, mock } = build({
      tables: { projects: [ok(project)], reports: [ok(null, { count: 0 })] },
    });
    await expect(service.getPreview(P1)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(touched(mock, 'branches')).toBe(0);
    expect(touched(mock, 'commits')).toBe(0);
    expect(touched(mock, 'drafts')).toBe(0);
  });

  it('403 dùng message cố định, không lộ thông tin dự án', async () => {
    const { service } = build({
      tables: { projects: [ok(project)], reports: [ok(null, { count: 0 })] },
    });
    await expect(service.getPreview(P1)).rejects.toThrow(
      'This project has no open reports',
    );
  });

  it('chỉ đếm báo cáo pending của đúng dự án', async () => {
    const { service, mock } = build({ tables: full() });
    await service.getPreview(P1);
    expect(mock.builders.reports.eq).toHaveBeenCalledWith('project_id', P1);
    expect(mock.builders.reports.eq).toHaveBeenCalledWith('status', 'pending');
  });

  it('có báo cáo: trả đúng số track, số nốt, tên và nhạc cụ track', async () => {
    const { service } = build({ tables: full() });
    await expect(service.getPreview(P1)).resolves.toEqual({
      project: { id: P1, name: 'Song A', description: 'desc', genre: 'Pop' },
      hasCommit: true,
      trackCount: 2,
      noteCount: 3,
      tracks: [
        { name: 'Lead', instrument: 'Flute' },
        { name: 'Bass', instrument: null },
      ],
    });
  });

  it('response không chứa snapshot, nốt, id track, màu hay email', async () => {
    const { service } = build({ tables: full() });
    const json = JSON.stringify(await service.getPreview(P1));
    for (const forbidden of [
      'snapshot',
      'notes',
      'pitch',
      'velocity',
      'trackId',
      '#fff',
      'email',
      'reporter',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('lấy head của nhánh mặc định rồi đọc đúng commit đó, bằng truy vấn đơn giản', async () => {
    const { service, mock } = build({ tables: full() });
    await service.getPreview(P1);
    expect(mock.builders.branches.eq).toHaveBeenCalledWith('project_id', P1);
    expect(mock.builders.branches.eq).toHaveBeenCalledWith('is_default', true);
    expect(mock.builders.commits.eq).toHaveBeenCalledWith('id', 'c1');
    for (const table of ['branches', 'commits']) {
      for (const call of mock.builders[table].select.mock.calls) {
        expect(String(call[0])).not.toMatch(/[:!(]/);
      }
    }
  });

  it('không bao giờ đọc bản nháp', async () => {
    const { service, mock } = build({ tables: full() });
    await service.getPreview(P1);
    expect(touched(mock, 'drafts')).toBe(0);
  });

  it('chưa có nhánh mặc định -> hasCommit false, số liệu 0, không đọc commit', async () => {
    const { service, mock } = build({
      tables: {
        projects: [ok(project)],
        reports: [ok(null, { count: 1 })],
        branches: [ok(null)],
      },
    });
    await expect(service.getPreview(P1)).resolves.toMatchObject({
      hasCommit: false,
      trackCount: 0,
      noteCount: 0,
      tracks: [],
    });
    expect(touched(mock, 'commits')).toBe(0);
  });

  it('nhánh chưa có head_commit_id -> hasCommit false', async () => {
    const { service, mock } = build({
      tables: {
        projects: [ok(project)],
        reports: [ok(null, { count: 1 })],
        branches: [ok({ head_commit_id: null })],
      },
    });
    await expect(service.getPreview(P1)).resolves.toMatchObject({
      hasCommit: false,
    });
    expect(touched(mock, 'commits')).toBe(0);
  });

  it('commit không còn -> hasCommit false', async () => {
    const { service } = build({
      tables: {
        projects: [ok(project)],
        reports: [ok(null, { count: 1 })],
        branches: [ok({ head_commit_id: 'c1' })],
        commits: [ok(null)],
      },
    });
    await expect(service.getPreview(P1)).resolves.toMatchObject({
      hasCommit: false,
      trackCount: 0,
    });
  });

  it.each(['projects', 'reports', 'branches', 'commits'])(
    'lỗi đọc bảng %s -> 500',
    async (table) => {
      const tables = full() as Record<string, QueryResult[]>;
      tables[table] = [{ data: null, error: { message: 'boom' } }];
      const { service } = build({ tables });
      await expect(service.getPreview(P1)).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
    },
  );
});
