import {
  BadRequestException,
  ConflictException,
  GoneException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PlatformSettingsService } from '../platform-settings/platform-settings.service';
import { ModerationRemovalService } from './moderation-removal.service';

const ADMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const OWNER = '99999999-9999-4999-8999-999999999999';
const S1 = '00000000-0000-4000-8000-000000000001';
const S2 = '00000000-0000-4000-8000-000000000002';

const ok = (data: unknown): QueryResult => ({ data, error: null });
const fail = (message = 'boom'): QueryResult => ({
  data: null,
  error: { message },
});

const project = (over: Record<string, unknown> = {}): QueryResult =>
  ok({
    id: PROJECT,
    name: 'Song A',
    owner_id: OWNER,
    moderation_hidden_at: null,
    ...over,
  });

interface Deps {
  customSounds: { delete: jest.Mock };
  notifications: { notify: jest.Mock };
  platformSettings: { get: jest.Mock };
}

function build(
  setup: {
    projects?: QueryResult[];
    rpc?: Record<string, QueryResult | QueryResult[]>;
    customSounds?: Deps['customSounds'];
    platformGet?: unknown;
    hiddenProject?: boolean;
    forks?: number;
  } = {},
) {
  const hidden = setup.hiddenProject
    ? { moderation_hidden_at: '2026-11-01T00:00:00Z' }
    : {};
  const projects: QueryResult[] = setup.projects
    ? setup.projects
    : [
        project(hidden),
        // second read: countForks (head:true) returns { count }.
        { data: null, error: null, count: setup.forks ?? 0 },
      ];
  const mock = createSupabaseMock([], {
    tables: {
      projects,
      admin_audit_log: [ok(null)],
    },
    rpc: setup.rpc ?? {},
  });
  const customSounds = setup.customSounds ?? {
    delete: jest.fn().mockResolvedValue({ removed: true, affectedProjects: 0 }),
  };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const platformSettings = {
    get: jest.fn().mockResolvedValue(setup.platformGet ?? 30),
  };
  const service = new ModerationRemovalService(
    mock.client,
    customSounds as unknown as CustomSoundsService,
    notifications as unknown as NotificationsService,
    platformSettings as unknown as PlatformSettingsService,
  );
  return { mock, service, customSounds, notifications, platformSettings };
}

const touched = (mock: ReturnType<typeof build>['mock'], table: string) =>
  (mock.client.from as jest.Mock).mock.calls.filter(
    (call: unknown[]) => call[0] === table,
  ).length;

const dto = (over: Record<string, unknown> = {}) =>
  ({ reason: 'x'.repeat(10), policy: 'copyright', ...over }) as never;

describe('ModerationRemovalService.removeProject', () => {
  let errorLog: jest.SpyInstance;
  beforeEach(() => {
    errorLog = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('dự án không tồn tại -> 404, không ghi gì', async () => {
    const { service, mock } = build({ projects: [ok(null)] });
    await expect(
      service.removeProject(ADMIN, PROJECT, dto()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('dự án đã bị ẩn -> 409, không ghi gì', async () => {
    const { service, mock } = build({ hiddenProject: true });
    await expect(
      service.removeProject(ADMIN, PROJECT, dto()),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it('removeSoundIds có id không thuộc chủ -> 400, không gọi RPC/thông báo/xoá sound', async () => {
    const { service, customSounds, notifications, mock } = build({
      rpc: {
        moderation_project_owner_sound_ids: ok([
          { sound_id: S1, sound_name: 'Kick' },
        ]),
      },
    });
    await expect(
      service.removeProject(ADMIN, PROJECT, dto({ removeSoundIds: [S2] })),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.rpc).not.toHaveBeenCalledWith(
      'moderation_remove_project',
      expect.anything(),
    );
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(customSounds.delete).not.toHaveBeenCalled();
  });

  it('bước ghi DB (RPC) lỗi -> 500; không thông báo, không xoá sound', async () => {
    const { service, customSounds, notifications, mock } = build({
      rpc: {
        moderation_project_owner_sound_ids: ok([]),
        moderation_remove_project: fail('db down'),
      },
    });
    await expect(
      service.removeProject(ADMIN, PROJECT, dto()),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(notifications.notify).not.toHaveBeenCalled();
    expect(customSounds.delete).not.toHaveBeenCalled();
    expect(touched(mock, 'admin_audit_log')).toBe(0);
  });

  it('thành công: audit một lần (project.remove, target project), thông báo một lần cho chủ, không lộ người báo cáo', async () => {
    const { service, mock, notifications, customSounds } = build({
      rpc: {
        moderation_project_owner_sound_ids: ok([
          { sound_id: S1, sound_name: 'Kick' },
        ]),
        moderation_remove_project: ok([
          {
            status: 'removed',
            closed_reports: 4,
            hidden_at: '2026-11-09T00:00:00Z',
          },
        ]),
      },
      platformGet: 30,
    });
    const result = await service.removeProject(
      ADMIN,
      PROJECT,
      dto({ removeSoundIds: [S1] }),
    );
    expect(result.closedReports).toBe(4);
    expect(mock.builders.admin_audit_log.insert).toHaveBeenCalledTimes(1);
    expect(mock.builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: ADMIN,
        action: 'project.remove',
        target_type: 'project',
        target_id: PROJECT,
      }),
    );
    expect(notifications.notify).toHaveBeenCalledTimes(1);
    const [userId, type, payload] = notifications.notify.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(userId).toBe(OWNER);
    expect(type).toBe('moderation.project_removed');
    expect(payload.projectName).toBe('Song A');
    const sent = JSON.stringify(notifications.notify.mock.calls);
    expect(sent).not.toContain(ADMIN);
    expect(sent).not.toContain('reporter');
    expect(customSounds.delete).toHaveBeenCalledWith(OWNER, S1, 'hard');
  });

  it('một sound xoá lỗi -> các sound khác vẫn xoá, soundResults phản ánh đúng, vẫn 200', async () => {
    const { service, customSounds } = build({
      rpc: {
        moderation_project_owner_sound_ids: ok([
          { sound_id: S1, sound_name: 'Kick' },
          { sound_id: S2, sound_name: 'Snare' },
        ]),
        moderation_remove_project: ok([
          {
            status: 'removed',
            closed_reports: 0,
            hidden_at: '2026-11-09T00:00:00Z',
          },
        ]),
      },
    });
    customSounds.delete
      .mockResolvedValueOnce({ removed: true, affectedProjects: 0 })
      .mockRejectedValueOnce(new Error('file gone'));
    const result = await service.removeProject(
      ADMIN,
      PROJECT,
      dto({ removeSoundIds: [S1, S2] }),
    );
    expect(result.soundResults).toEqual([
      { id: S1, removed: true },
      { id: S2, removed: false, error: 'Could not delete sound' },
    ]);
  });

  it('thông báo lỗi -> vẫn 200', async () => {
    const { service, notifications } = build({
      rpc: {
        moderation_project_owner_sound_ids: ok([]),
        moderation_remove_project: ok([
          {
            status: 'removed',
            closed_reports: 0,
            hidden_at: '2026-11-09T00:00:00Z',
          },
        ]),
      },
    });
    notifications.notify.mockRejectedValue(new Error('notify down'));
    await expect(
      service.removeProject(ADMIN, PROJECT, dto()),
    ).resolves.toBeDefined();
    expect(errorLog).toHaveBeenCalled();
  });
});

describe('ModerationRemovalService.restoreProject', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('không bị gỡ -> 409', async () => {
    const { service } = build({});
    await expect(
      service.restoreProject(ADMIN, PROJECT, 'ok'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('quá hạn lưu giữ -> 410', async () => {
    const { service } = build({ hiddenProject: true, platformGet: 1 });
    // hidden 2026-11-01 + 1 day = 2026-11-02, safely in the past.
    await expect(
      service.restoreProject(ADMIN, PROJECT, 'ok'),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('đúng hạn -> thành công + audit + thông báo', async () => {
    const { service, mock, notifications } = build({
      hiddenProject: true,
      platformGet: 365,
      rpc: { moderation_restore_project: ok([{ status: 'restored' }]) },
    });
    const result = await service.restoreProject(
      ADMIN,
      PROJECT,
      'Restored by mistake',
    );
    expect(result).toEqual({ restored: true });
    expect(mock.builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: ADMIN,
        action: 'project.restore',
        target_type: 'project',
        target_id: PROJECT,
        reason: 'Restored by mistake',
      }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      OWNER,
      'moderation.project_restored',
      {
        projectName: 'Song A',
      },
    );
  });

  it('lý do rỗng -> 400, không gọi RPC', async () => {
    const { service, mock } = build({ hiddenProject: true });
    await expect(
      service.restoreProject(ADMIN, PROJECT, '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(mock.rpc).not.toHaveBeenCalled();
  });
});

describe('ModerationRemovalService.getRemovalImpact', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('không trả sound không thuộc chủ dự án; dùng PlatformSettingsService cho retentionDays', async () => {
    const { service, platformSettings } = build({
      rpc: {
        moderation_project_owner_sound_ids: ok([
          { sound_id: S1, sound_name: 'Kick' },
          { sound_id: S2, sound_name: 'Snare' },
        ]),
      },
      platformGet: 45,
    });
    const impact = await service.getRemovalImpact(PROJECT);
    expect(impact.retentionDays).toBe(45);
    expect(platformSettings.get).toHaveBeenCalledWith(
      'moderation_retention_days',
      30,
    );
    expect(impact.ownerSounds.map((s) => s.id)).toEqual([S1, S2]);
    // forkCount comes from the projects table count
    expect(impact.forkCount).toBe(0);
  });
});
