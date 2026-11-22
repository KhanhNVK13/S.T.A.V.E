import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { ReportModerationService } from './report-moderation.service';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PlatformSettingsService } from '../platform-settings/platform-settings.service';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const FORK = '77777777-7777-4777-8777-777777777777';
const FORK_OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REPORTER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function build(
  rpc: Record<string, unknown> = {},
  tables: Record<
    string,
    { data?: unknown; error?: unknown; count?: number }[]
  > = {},
) {
  const mock = createSupabaseMock([], {
    rpc: { sound_mappings_page: { data: [], error: null }, ...rpc },
    tables,
  });
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const settings = { get: jest.fn().mockResolvedValue(30) };
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
  return { mock, service, notifications };
}

const claim = {
  claimantName: 'Nguyen Van A',
  claimantRole: 'owner',
  workDescription: 'Bài hát Mưa năm 2020',
  evidence: 'Bản thảo gốc',
  goodFaith: true,
  accuracy: true,
};

describe('BE-RPT-08 ReportModerationService.takedownCopyright', () => {
  const row = {
    o_owner_id: OWNER,
    o_project_name: 'Song',
    o_reporter_ids: [REPORTER],
    o_file_urls: [],
    o_closed_count: 1,
    o_forks: [{ projectId: FORK, ownerId: FORK_OWNER, name: 'Song remix' }],
  };

  it('UTCID01 gọi một RPC, báo chủ gốc, chủ từng fork và người báo cáo', async () => {
    const { service, mock, notifications } = build({
      admin_remove_copyright_project: { data: [row], error: null },
    });
    const result = await service.takedownCopyright(ADMIN, PROJECT, {
      reason: 'Copied a commercial track note for note',
    });
    expect(mock.rpc).toHaveBeenCalledWith('admin_remove_copyright_project', {
      p_admin_id: ADMIN,
      p_project_id: PROJECT,
      p_reason: 'Copied a commercial track note for note',
      p_sound_ids: [],
    });
    expect(result).toMatchObject({
      closedReports: 1,
      removedForks: 1,
      removedSounds: 0,
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      OWNER,
      'moderation.project_removed',
      expect.objectContaining({ projectName: 'Song' }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      FORK_OWNER,
      'moderation.project_removed',
      expect.objectContaining({ projectName: 'Song remix', projectId: FORK }),
    );
    expect(notifications.notify).toHaveBeenCalledWith(
      REPORTER,
      'report.reviewed',
      expect.anything(),
    );
  });

  it('UTCID02 dự án đã bị gỡ thì 409 và không gửi thông báo', async () => {
    const { service, notifications } = build({
      admin_remove_copyright_project: {
        data: null,
        error: { message: 'ALREADY_REMOVED' },
      },
    });
    await expect(
      service.takedownCopyright(ADMIN, PROJECT, {
        reason: 'Copied a commercial track note for note',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('UTCID03 không có báo cáo bản quyền đang mở thì 409', async () => {
    const { service } = build({
      admin_remove_copyright_project: {
        data: null,
        error: { message: 'NO_OPEN_REPORTS' },
      },
    });
    await expect(
      service.takedownCopyright(ADMIN, PROJECT, {
        reason: 'Copied a commercial track note for note',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('UTCID04 dự án không tồn tại thì 404', async () => {
    const { service } = build({
      admin_remove_copyright_project: {
        data: null,
        error: { message: 'PROJECT_NOT_FOUND' },
      },
    });
    await expect(
      service.takedownCopyright(ADMIN, PROJECT, {
        reason: 'Copied a commercial track note for note',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('BE-RPT-09 ReportModerationService.getCopyrightContext', () => {
  const tables = (claims: unknown[]) => ({
    projects: [
      { data: { id: PROJECT, owner_id: OWNER }, error: null },
      { data: null, error: null, count: 1 },
      {
        data: [{ id: FORK, name: 'Song remix', owner_id: FORK_OWNER }],
        error: null,
      },
      { data: [], error: null },
      { data: [{ id: PROJECT }], error: null },
    ],
    reports: [{ data: claims, error: null }],
    branches: [{ data: [], error: null }],
    admin_audit_log: [{ data: null, error: null, count: 2 }],
    users: [
      { data: [{ id: FORK_OWNER, display_name: 'Fork Owner' }], error: null },
    ],
  });

  it('UTCID01 trả khiếu nại, danh sách fork kèm chủ và số lần tái phạm', async () => {
    const { service } = build(
      {},
      tables([{ id: 'r1', created_at: '2026-11-20', copyright_claim: claim }]),
    );
    const context = await service.getCopyrightContext(PROJECT);
    expect(context.claims).toHaveLength(1);
    expect(context.claims[0]).toMatchObject({
      reportId: 'r1',
      claimantName: 'Nguyen Van A',
    });
    expect(context.forks).toEqual([
      { projectId: FORK, name: 'Song remix', ownerDisplayName: 'Fork Owner' },
    ]);
    expect(context.priorTakedowns).toBe(2);
    expect(context.retentionDays).toBe(30);
  });

  it('UTCID02 không có báo cáo bản quyền đang mở thì 403', async () => {
    const { service } = build({}, tables([]));
    await expect(service.getCopyrightContext(PROJECT)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

describe('BE-RPT-09 getCopyrightContext: báo cáo cũ không có thông tin khiếu nại', () => {
  it('UTCID03 vẫn mở được công cụ gỡ, danh sách khiếu nại rỗng', async () => {
    const { service } = build(
      {},
      {
        projects: [
          { data: { id: PROJECT, owner_id: OWNER }, error: null },
          { data: null, error: null, count: 0 },
          { data: [], error: null },
          { data: [{ id: PROJECT }], error: null },
        ],
        reports: [
          {
            data: [
              { id: 'r1', created_at: '2026-11-20', copyright_claim: null },
            ],
            error: null,
          },
        ],
        branches: [{ data: [], error: null }],
        admin_audit_log: [{ data: null, error: null, count: 0 }],
      },
    );
    const context = await service.getCopyrightContext(PROJECT);
    expect(context.claims).toEqual([]);
    expect(context.forks).toEqual([]);
  });

  it('UTCID04 duyệt xuyên qua fork đã bị ẩn để liệt kê fork của nó', async () => {
    const HIDDEN = '99999999-9999-4999-8999-999999999999';
    const { service } = build(
      {},
      {
        projects: [
          { data: { id: PROJECT, owner_id: OWNER }, error: null },
          { data: null, error: null, count: 1 },
          {
            data: [
              {
                id: HIDDEN,
                name: 'Old fork',
                owner_id: OWNER,
                moderation_hidden_at: '2026-11-01',
              },
            ],
            error: null,
          },
          {
            data: [
              {
                id: FORK,
                name: 'Grandchild',
                owner_id: FORK_OWNER,
                moderation_hidden_at: null,
              },
            ],
            error: null,
          },
          { data: [], error: null },
          { data: [{ id: PROJECT }], error: null },
        ],
        reports: [
          {
            data: [
              { id: 'r1', created_at: '2026-11-20', copyright_claim: claim },
            ],
            error: null,
          },
        ],
        branches: [{ data: [], error: null }],
        admin_audit_log: [{ data: null, error: null, count: 0 }],
        users: [
          {
            data: [{ id: FORK_OWNER, display_name: 'Fork Owner' }],
            error: null,
          },
        ],
      },
    );
    const context = await service.getCopyrightContext(PROJECT);
    expect(context.forks.map((fork) => fork.projectId)).toEqual([FORK]);
  });
});

describe('BE-RPT-06 restoreProject: bản fork cùng đợt gỡ', () => {
  it('UTCID05 báo chủ của từng fork được khôi phục kèm', async () => {
    const { service, notifications } = build({
      admin_restore_project_tree: {
        data: [
          {
            o_status: 'restored',
            o_owner_id: OWNER,
            o_project_name: 'Song',
            o_restored_forks: [
              { projectId: FORK, ownerId: FORK_OWNER, name: 'Song remix' },
            ],
          },
        ],
        error: null,
      },
    });
    await service.restoreProject(ADMIN, PROJECT);
    expect(notifications.notify).toHaveBeenCalledWith(
      FORK_OWNER,
      'moderation.project_restored',
      expect.objectContaining({ projectName: 'Song remix' }),
    );
  });
});
