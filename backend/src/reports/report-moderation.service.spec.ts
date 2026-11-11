import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { ReportModerationService } from './report-moderation.service';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import type { RemoveProjectDto } from './dto/remove-project.dto';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const REPORTER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const R1 = '44444444-4444-4444-8444-444444444444';
const SOUND = '55555555-5555-4555-8555-555555555555';

function build(
  rpc: Record<string, unknown> = {},
  tables: Record<
    string,
    { data?: unknown; error?: unknown; count?: number }[]
  > = {},
  retention: unknown = 30,
) {
  const mock = createSupabaseMock([], {
    rpc: {
      sound_mappings_page: { data: [], error: null },
      ...rpc,
    },
    tables,
  });
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const settings = { get: jest.fn().mockResolvedValue(retention) };
  const customSounds = {
    removeFiles: jest.fn().mockResolvedValue([] as string[]),
    collectGarbage: jest.fn().mockResolvedValue(undefined),
  };
  const service = new ReportModerationService(
    mock.client,
    notifications as unknown as NotificationsService,
    settings as unknown as PlatformSettingsService,
    customSounds as unknown as CustomSoundsService,
  );
  return { mock, service, notifications, customSounds };
}

const removeDto = (over: Partial<RemoveProjectDto> = {}): RemoveProjectDto => ({
  reason: 'Copied a commercial track note for note',
  policy: 'copyright',
  ...over,
});

const removeRow = {
  o_owner_id: OWNER,
  o_project_name: 'Song',
  o_reporter_ids: [REPORTER],
  o_file_urls: ['owner/a.wav'],
  o_closed_count: 2,
};

describe('ReportModerationService.removeProject', () => {
  const withSounds = {
    projects: [
      { data: { id: PROJECT, owner_id: OWNER }, error: null },
      { data: null, error: null, count: 0 },
    ],
    reports: [{ data: null, error: null, count: 1 }],
    branches: [{ data: [{ id: 'b1', head_commit_id: 'c1' }], error: null }],
    commits: [
      {
        data: [{ snapshot: { tracks: [{ soundMap: { '36': SOUND } }] } }],
        error: null,
      },
    ],
    drafts: [{ data: [], error: null }],
    custom_sounds: [{ data: [{ id: SOUND, name: 'Kick' }], error: null }],
  };

  it('chỉ nhận sound thuộc dự án: id lạ bị từ chối và không gọi RPC', async () => {
    const { service, mock } = build(
      { admin_remove_reported_project: { data: [removeRow], error: null } },
      withSounds,
    );
    await expect(
      service.removeProject(
        ADMIN,
        PROJECT,
        removeDto({ removeSoundIds: ['66666666-6666-4666-8666-666666666666'] }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.rpc).not.toHaveBeenCalledWith(
      'admin_remove_reported_project',
      expect.anything(),
    );
  });

  it('gọi một RPC, xoá file âm thanh, báo chủ dự án và người báo cáo', async () => {
    const { service, mock, notifications, customSounds } = build(
      { admin_remove_reported_project: { data: [removeRow], error: null } },
      withSounds,
    );
    const result = await service.removeProject(
      ADMIN,
      PROJECT,
      removeDto({ removeSoundIds: [SOUND] }),
    );
    expect(mock.rpc).toHaveBeenCalledWith('admin_remove_reported_project', {
      p_admin_id: ADMIN,
      p_project_id: PROJECT,
      p_reason: 'Copied a commercial track note for note',
      p_policy: 'copyright',
      p_sound_ids: [SOUND],
    });
    expect(customSounds.removeFiles).toHaveBeenCalledWith(['owner/a.wav']);
    expect(notifications.notify).toHaveBeenCalledWith(
      OWNER,
      'moderation.project_removed',
      expect.objectContaining({ projectName: 'Song' }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      REPORTER,
      'report.reviewed',
      { projectName: 'Song' },
    );
    expect(result.closedReports).toBe(2);
    expect(result.removedSounds).toBe(1);
  });

  it('không lộ người báo cáo trong thông báo gửi chủ dự án', async () => {
    const { service, notifications } = build({
      admin_remove_reported_project: { data: [removeRow], error: null },
    });
    await service.removeProject(ADMIN, PROJECT, removeDto());
    const ownerCall = notifications.notify.mock.calls.find(
      (call: unknown[]) => call[0] === OWNER,
    ) as unknown[];
    expect(JSON.stringify(ownerCall)).not.toContain(REPORTER);
  });

  it.each([
    ['PROJECT_NOT_FOUND', NotFoundException],
    ['ALREADY_REMOVED', ConflictException],
    ['NO_OPEN_REPORTS', ConflictException],
    ['boom', InternalServerErrorException],
  ])(
    'RPC lỗi %s được ánh xạ đúng và không gửi thông báo',
    async (code, type) => {
      const { service, notifications } = build({
        admin_remove_reported_project: { data: null, error: { message: code } },
      });
      await expect(
        service.removeProject(ADMIN, PROJECT, removeDto()),
      ).rejects.toBeInstanceOf(type);
      expect(notifications.notify).not.toHaveBeenCalled();
    },
  );

  it('lỗi xoá file Storage không làm hỏng thao tác đã commit, vẫn chạy quét mồ côi', async () => {
    const { service, customSounds } = build({
      admin_remove_reported_project: { data: [removeRow], error: null },
    });
    customSounds.removeFiles.mockRejectedValue(new Error('storage down'));
    await expect(
      service.removeProject(ADMIN, PROJECT, removeDto()),
    ).resolves.toMatchObject({ closedReports: 2 });
    expect(customSounds.collectGarbage).toHaveBeenCalledTimes(1);
  });

  it('file không xoá được thì log cảnh báo nêu rõ đường dẫn và để lần quét sau thu dọn', async () => {
    const { service, customSounds } = build({
      admin_remove_reported_project: { data: [removeRow], error: null },
    });
    customSounds.removeFiles.mockResolvedValue(['owner/a.wav']);
    const warn = jest
      .spyOn(
        (service as unknown as { logger: { warn: () => void } }).logger,
        'warn',
      )
      .mockImplementation(() => undefined);
    await expect(
      service.removeProject(ADMIN, PROJECT, removeDto()),
    ).resolves.toMatchObject({ closedReports: 2 });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('owner/a.wav'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('orphan sweep'));
  });

  it('removedSounds là số âm thanh đã xoá khỏi DB, không phải số file Storage lọc được', async () => {
    const { service } = build({
      admin_remove_reported_project: {
        data: [
          { ...removeRow, o_file_urls: ['owner/a.wav', '', 'owner/b.wav'] },
        ],
        error: null,
      },
    });
    const result = await service.removeProject(ADMIN, PROJECT, removeDto());
    expect(result.removedSounds).toBe(3);
  });

  it('không xoá âm thanh nào thì removedSounds là 0 và không đụng Storage', async () => {
    const { service, customSounds } = build({
      admin_remove_reported_project: {
        data: [{ ...removeRow, o_file_urls: [] }],
        error: null,
      },
    });
    const result = await service.removeProject(ADMIN, PROJECT, removeDto());
    expect(result.removedSounds).toBe(0);
    expect(customSounds.removeFiles).not.toHaveBeenCalled();
  });

  it('báo cáo đã xử lý: chọn âm thanh hay không đều trả 409, không gọi RPC', async () => {
    const closed = build(
      { admin_remove_reported_project: { data: [removeRow], error: null } },
      {
        projects: [{ data: { id: PROJECT, owner_id: OWNER }, error: null }],
        reports: [{ data: null, error: null, count: 0 }],
      },
    );
    await expect(
      closed.service.removeProject(
        ADMIN,
        PROJECT,
        removeDto({ removeSoundIds: [SOUND] }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(closed.mock.rpc).not.toHaveBeenCalled();

    const noSounds = build({
      admin_remove_reported_project: {
        data: null,
        error: { message: 'NO_OPEN_REPORTS' },
      },
    });
    await expect(
      noSounds.service.removeProject(ADMIN, PROJECT, removeDto()),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('báo người báo cáo theo lô, một người lỗi không làm hỏng thao tác và được log', async () => {
    const reporters = Array.from(
      { length: 45 },
      (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    const { service, notifications } = build({
      admin_remove_reported_project: {
        data: [{ ...removeRow, o_reporter_ids: reporters }],
        error: null,
      },
    });
    let inFlight = 0;
    let peak = 0;
    notifications.notify.mockImplementation(async (userId: string) => {
      if (userId === OWNER) return;
      inFlight++;
      peak = Math.max(peak, inFlight);
      await Promise.resolve();
      inFlight--;
      if (userId === reporters[3]) throw new Error('boom');
    });
    const error = jest
      .spyOn(
        (service as unknown as { logger: { error: () => void } }).logger,
        'error',
      )
      .mockImplementation(() => undefined);
    await expect(
      service.removeProject(ADMIN, PROJECT, removeDto()),
    ).resolves.toMatchObject({ closedReports: 2 });
    const reviewed = notifications.notify.mock.calls.filter(
      (call: unknown[]) => call[1] === 'report.reviewed',
    );
    expect(reviewed).toHaveLength(45);
    expect(peak).toBeLessThanOrEqual(20);
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('Could not notify 1 of 20'),
    );
  });
});

describe('ReportModerationService.dismissReports', () => {
  it('đóng báo cáo và báo người báo cáo mà không nói kết quả', async () => {
    const { service, notifications } = build({
      admin_dismiss_reports: {
        data: [
          {
            o_status: 'dismissed',
            o_project_name: 'Song',
            o_reporter_ids: [REPORTER],
            o_pending_ids: [R1],
          },
        ],
        error: null,
      },
    });
    const result = await service.dismissReports(ADMIN, PROJECT, {
      reportIds: [R1],
      reason: 'Does not break any rule',
    });
    expect(result).toEqual({ dismissed: 1 });
    expect(notifications.notify).toHaveBeenCalledWith(
      REPORTER,
      'report.reviewed',
      { projectName: 'Song' },
    );
  });

  it('có báo cáo mới trong lúc xem thì 409 kèm danh sách mới và không đóng gì', async () => {
    const { service, notifications } = build({
      admin_dismiss_reports: {
        data: [
          {
            o_status: 'stale',
            o_project_name: 'Song',
            o_reporter_ids: [],
            o_pending_ids: [R1, SOUND],
          },
        ],
        error: null,
      },
    });
    const promise = service.dismissReports(ADMIN, PROJECT, {
      reportIds: [R1],
      reason: 'Does not break any rule',
    });
    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: { code: 'REPORTS_CHANGED', pendingReportIds: [R1, SOUND] },
    });
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('dự án không tồn tại thì 404', async () => {
    const { service } = build({
      admin_dismiss_reports: {
        data: null,
        error: { message: 'PROJECT_NOT_FOUND' },
      },
    });
    await expect(
      service.dismissReports(ADMIN, PROJECT, {
        reportIds: [R1],
        reason: 'Does not break any rule',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('ReportModerationService.restoreProject', () => {
  const rpcRow = (status: string) => ({
    admin_restore_project: {
      data: [{ o_status: status, o_owner_id: OWNER, o_project_name: 'Song' }],
      error: null,
    },
  });

  it('khôi phục và báo chủ dự án, truyền thời hạn lưu giữ đọc từ cài đặt', async () => {
    const { service, mock, notifications } = build(rpcRow('restored'), {}, 14);
    await expect(service.restoreProject(ADMIN, PROJECT)).resolves.toEqual({
      restored: true,
    });
    expect(mock.rpc).toHaveBeenCalledWith('admin_restore_project', {
      p_admin_id: ADMIN,
      p_project_id: PROJECT,
      p_retention_days: 14,
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      OWNER,
      'moderation.project_restored',
      expect.objectContaining({ projectName: 'Song' }),
    );
  });

  it('hết hạn lưu giữ thì 410', async () => {
    const { service, notifications } = build(rpcRow('expired'));
    await expect(service.restoreProject(ADMIN, PROJECT)).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('dự án chưa bị gỡ thì 409', async () => {
    const { service } = build(rpcRow('not_removed'));
    await expect(service.restoreProject(ADMIN, PROJECT)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('cài đặt lưu giữ sai kiểu thì dùng mặc định 30 ngày', async () => {
    const { service, mock } = build(rpcRow('restored'), {}, 'abc');
    await service.restoreProject(ADMIN, PROJECT);
    expect(mock.rpc).toHaveBeenCalledWith(
      'admin_restore_project',
      expect.objectContaining({ p_retention_days: 30 }),
    );
  });
});

describe('ReportModerationService.getRemovalContext', () => {
  it('đếm fork và chỉ liệt kê custom sound của chủ có trong snapshot', async () => {
    const { service } = build(
      {},
      {
        projects: [
          { data: { id: PROJECT, owner_id: OWNER }, error: null },
          { data: null, error: null, count: 3 },
        ],
        reports: [{ data: null, error: null, count: 2 }],
        branches: [{ data: [{ id: 'b1', head_commit_id: 'c1' }], error: null }],
        commits: [
          {
            data: [
              {
                snapshot: {
                  tracks: [{ soundMap: { '36': SOUND, '38': SOUND } }, {}],
                },
              },
            ],
            error: null,
          },
        ],
        drafts: [{ data: [], error: null }],
        custom_sounds: [{ data: [{ id: SOUND, name: 'Kick' }], error: null }],
      },
    );
    await expect(service.getRemovalContext(PROJECT)).resolves.toEqual({
      forkCount: 3,
      sounds: [{ id: SOUND, name: 'Kick' }],
      retentionDays: 30,
    });
  });

  it('dự án không có commit thì không có sound để chọn', async () => {
    const { service } = build(
      {},
      {
        projects: [
          { data: { id: PROJECT, owner_id: OWNER }, error: null },
          { data: null, error: null, count: 0 },
        ],
        reports: [{ data: null, error: null, count: 1 }],
        branches: [{ data: [{ id: 'b1', head_commit_id: null }], error: null }],
        drafts: [{ data: [], error: null }],
      },
    );
    await expect(service.getRemovalContext(PROJECT)).resolves.toMatchObject({
      sounds: [],
      forkCount: 0,
    });
  });

  it('lấy sound từ mọi nhánh và từ nháp, mỗi sound một lần', async () => {
    const OTHER = '77777777-7777-4777-8777-777777777777';
    const DRAFT_ONLY = '88888888-8888-4888-8888-888888888888';
    const { service, mock } = build(
      {},
      {
        projects: [
          { data: { id: PROJECT, owner_id: OWNER }, error: null },
          { data: null, error: null, count: 0 },
        ],
        reports: [{ data: null, error: null, count: 1 }],
        branches: [
          {
            data: [
              { id: 'b1', head_commit_id: 'c1' },
              { id: 'b2', head_commit_id: 'c2' },
              { id: 'b3', head_commit_id: null },
            ],
            error: null,
          },
        ],
        commits: [
          {
            data: [
              { snapshot: { tracks: [{ soundMap: { '36': SOUND } }] } },
              { snapshot: { tracks: [{ soundMap: { '38': OTHER } }] } },
            ],
            error: null,
          },
        ],
        drafts: [
          {
            data: [
              { snapshot: { tracks: [{ soundMap: { '40': DRAFT_ONLY } }] } },
              { snapshot: { tracks: [{ soundMap: { '36': SOUND } }] } },
            ],
            error: null,
          },
        ],
        custom_sounds: [
          {
            data: [
              { id: SOUND, name: 'Kick' },
              { id: OTHER, name: 'Snare' },
              { id: DRAFT_ONLY, name: 'Hat' },
            ],
            error: null,
          },
        ],
      },
    );
    const context = await service.getRemovalContext(PROJECT);
    expect(context.sounds.map((sound) => sound.name)).toEqual([
      'Kick',
      'Snare',
      'Hat',
    ]);
    const tables = (mock.client.from as jest.Mock).mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(tables).toContain('drafts');
  });

  const contextTables = (soundRows = [{ id: SOUND, name: 'Kick' }]) => ({
    projects: [
      { data: { id: PROJECT, owner_id: OWNER }, error: null },
      { data: null, error: null, count: 0 },
    ],
    reports: [{ data: null, error: null, count: 1 }],
    branches: [{ data: [{ id: 'b1', head_commit_id: null }], error: null }],
    drafts: [{ data: [], error: null }],
    custom_sounds: [{ data: soundRows, error: null }],
  });

  it('quét cả lịch sử qua RPC phân trang: sound chỉ có ở commit cũ vẫn được liệt kê', async () => {
    const { service, mock } = build(
      {
        sound_mappings_page: {
          data: [
            { o_id: 'm1', o_custom_sound_id: SOUND },
            { o_id: 'm2', o_custom_sound_id: SOUND },
          ],
          error: null,
        },
      },
      contextTables(),
    );
    const context = await service.getRemovalContext(PROJECT);
    expect(context.sounds).toEqual([{ id: SOUND, name: 'Kick' }]);
    expect(mock.rpc).toHaveBeenCalledWith('sound_mappings_page', {
      p_project_id: PROJECT,
      p_limit: 500,
      p_after: null,
    });
  });

  it('trang đầy thì gọi tiếp với con trỏ là id cuối, dừng khi trang chưa đầy', async () => {
    const full = Array.from({ length: 500 }, (_, i) => ({
      o_id: `id-${String(i).padStart(3, '0')}`,
      o_custom_sound_id: SOUND,
    }));
    const { service, mock } = build(
      {
        sound_mappings_page: [
          { data: full, error: null },
          { data: [{ o_id: 'id-999', o_custom_sound_id: null }], error: null },
        ],
      },
      contextTables(),
    );
    await service.getRemovalContext(PROJECT);
    const calls = mock.rpc.mock.calls.filter(
      (call: unknown[]) => call[0] === 'sound_mappings_page',
    );
    expect(calls).toHaveLength(2);
    expect(calls[1][1]).toMatchObject({ p_after: 'id-499' });
  });

  it('lỗi RPC chỉ mục sound thì 500, không coi là không có sound', async () => {
    const { service } = build(
      { sound_mappings_page: { data: null, error: { message: 'boom' } } },
      contextTables(),
    );
    await expect(service.getRemovalContext(PROJECT)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('lỗi đọc nhánh thì 500', async () => {
    const { service } = build(
      {},
      {
        projects: [
          { data: { id: PROJECT, owner_id: OWNER }, error: null },
          { data: null, error: null, count: 0 },
        ],
        reports: [{ data: null, error: null, count: 1 }],
        branches: [{ data: null, error: { message: 'boom' } }],
      },
    );
    await expect(service.getRemovalContext(PROJECT)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });

  it('dự án không tồn tại thì 404', async () => {
    const { service } = build({}, { projects: [{ data: null, error: null }] });
    await expect(service.getRemovalContext(PROJECT)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('dự án không có báo cáo đang mở thì 403 và không đọc snapshot hay custom sound', async () => {
    const { service, mock } = build(
      {},
      {
        projects: [{ data: { id: PROJECT, owner_id: OWNER }, error: null }],
        reports: [{ data: null, error: null, count: 0 }],
      },
    );
    await expect(service.getRemovalContext(PROJECT)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    const tables = (mock.client.from as jest.Mock).mock.calls.map(
      (call: unknown[]) => call[0],
    );
    expect(tables).not.toContain('branches');
    expect(tables).not.toContain('commits');
    expect(tables).not.toContain('custom_sounds');
  });

  it('lỗi đếm báo cáo thì 500, không coi như không có báo cáo', async () => {
    const { service } = build(
      {},
      {
        projects: [{ data: { id: PROJECT, owner_id: OWNER }, error: null }],
        reports: [{ data: null, error: { message: 'boom' } }],
      },
    );
    await expect(service.getRemovalContext(PROJECT)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
