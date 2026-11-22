import {
  ConflictException,
  GoneException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { AppealsService } from './appeals.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { ReportModerationService } from './report-moderation.service';

const ADMIN = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const PROJECT = '33333333-3333-4333-8333-333333333333';
const APPEAL = '88888888-8888-4888-8888-888888888888';
const FORK = '77777777-7777-4777-8777-777777777777';
const FORK_OWNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const daysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString();

function build(
  tables: Record<
    string,
    { data?: unknown; error?: unknown; count?: number }[]
  > = {},
  rpc: Record<string, QueryResult | QueryResult[]> = {},
) {
  const mock = createSupabaseMock([], { tables, rpc });
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  const moderation = {
    getRetentionDays: jest.fn().mockResolvedValue(30),
    notifyForkOwners: jest.fn().mockResolvedValue(undefined),
  };
  const service = new AppealsService(
    mock.client,
    notifications as unknown as NotificationsService,
    moderation as unknown as ReportModerationService,
  );
  return { mock, service, notifications, moderation };
}

const hiddenProject = (hiddenDaysAgo: number, owner = OWNER) => ({
  id: PROJECT,
  name: 'Song',
  owner_id: owner,
  moderation_hidden_at: daysAgo(hiddenDaysAgo),
  moderation_hidden_reason: 'Copied a track',
  moderation_policy: 'copyright',
});

describe('BE-RPT-10 AppealsService.listRemoved', () => {
  it('UTCID01 dự án trong hạn và chưa kháng cáo thì canAppeal = true', async () => {
    const { service } = build({
      projects: [{ data: [hiddenProject(2)], error: null }],
      moderation_appeals: [{ data: [], error: null }],
    });
    const [item] = await service.listRemoved(OWNER);
    expect(item).toMatchObject({
      projectId: PROJECT,
      canAppeal: true,
      appealStatus: null,
    });
  });

  it('UTCID02 quá hạn lưu giữ thì không kháng cáo được', async () => {
    const { service } = build({
      projects: [{ data: [hiddenProject(40)], error: null }],
      moderation_appeals: [{ data: [], error: null }],
    });
    const [item] = await service.listRemoved(OWNER);
    expect(item.canAppeal).toBe(false);
  });

  it('UTCID03 kháng cáo của lần gỡ trước không chặn lần gỡ mới', async () => {
    const { service } = build({
      projects: [{ data: [hiddenProject(2)], error: null }],
      moderation_appeals: [
        {
          data: [
            {
              id: APPEAL,
              project_id: PROJECT,
              appellant_id: OWNER,
              statement: 'x',
              status: 'rejected',
              created_at: daysAgo(10),
              resolution_note: null,
              resolved_at: null,
            },
          ],
          error: null,
        },
      ],
    });
    const [item] = await service.listRemoved(OWNER);
    expect(item).toMatchObject({ canAppeal: true, appealStatus: null });
  });

  it('UTCID04 chưa có dự án bị gỡ thì trả mảng rỗng', async () => {
    const { service } = build({ projects: [{ data: [], error: null }] });
    await expect(service.listRemoved(OWNER)).resolves.toEqual([]);
  });
});

describe('BE-RPT-11 AppealsService.createAppeal', () => {
  const statement = 'Đây là bài tôi tự sáng tác, có bản thảo gốc.';

  it('UTCID01 tạo kháng cáo và báo các admin', async () => {
    const { service, mock, notifications } = build({
      projects: [{ data: hiddenProject(2), error: null }],
      moderation_appeals: [
        { data: [], error: null },
        { data: { id: APPEAL }, error: null },
      ],
      users: [{ data: [{ id: ADMIN }], error: null }],
    });
    await expect(
      service.createAppeal(OWNER, PROJECT, statement),
    ).resolves.toEqual({ id: APPEAL });
    expect(mock.builders.moderation_appeals.insert).toHaveBeenCalledWith({
      project_id: PROJECT,
      appellant_id: OWNER,
      statement,
      status: 'pending',
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      ADMIN,
      'moderation.appeal_received',
      { projectName: 'Song' },
    );
  });

  it('UTCID02 người không phải chủ thì 404', async () => {
    const { service } = build({
      projects: [{ data: hiddenProject(2, OTHER), error: null }],
    });
    await expect(
      service.createAppeal(OWNER, PROJECT, statement),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('UTCID03 dự án chưa bị gỡ thì 409', async () => {
    const { service } = build({
      projects: [
        {
          data: { ...hiddenProject(2), moderation_hidden_at: null },
          error: null,
        },
      ],
    });
    await expect(
      service.createAppeal(OWNER, PROJECT, statement),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('UTCID04 quá hạn thì 410', async () => {
    const { service } = build({
      projects: [{ data: hiddenProject(40), error: null }],
    });
    await expect(
      service.createAppeal(OWNER, PROJECT, statement),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('UTCID05 đã kháng cáo lần gỡ này rồi thì 409', async () => {
    const { service } = build({
      projects: [{ data: hiddenProject(2), error: null }],
      moderation_appeals: [
        {
          data: [
            {
              id: APPEAL,
              project_id: PROJECT,
              appellant_id: OWNER,
              statement: 'x',
              status: 'pending',
              created_at: daysAgo(1),
              resolution_note: null,
              resolved_at: null,
            },
          ],
          error: null,
        },
      ],
    });
    await expect(
      service.createAppeal(OWNER, PROJECT, statement),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('UTCID06 vi phạm chỉ mục duy nhất (gửi trùng đồng thời) thì 409', async () => {
    const { service } = build({
      projects: [{ data: hiddenProject(2), error: null }],
      moderation_appeals: [
        { data: [], error: null },
        { data: null, error: { code: '23505', message: 'dup' } },
      ],
    });
    await expect(
      service.createAppeal(OWNER, PROJECT, statement),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('BE-RPT-12 AppealsService.resolveAppeal', () => {
  it('UTCID01 chấp nhận: gọi RPC, báo người kháng cáo và chủ các fork được khôi phục', async () => {
    const { service, mock, notifications, moderation } = build(
      {},
      {
        admin_resolve_appeal: {
          data: [
            {
              o_status: 'upheld',
              o_appellant_id: OWNER,
              o_project_id: PROJECT,
              o_project_name: 'Song',
              o_restored_forks: [
                { projectId: FORK, ownerId: FORK_OWNER, name: 'Remix' },
              ],
            },
          ],
          error: null,
        },
      },
    );
    await expect(
      service.resolveAppeal(ADMIN, APPEAL, 'uphold', 'Có bản thảo gốc'),
    ).resolves.toEqual({ status: 'upheld', restoredForks: 1 });
    expect(mock.rpc).toHaveBeenCalledWith('admin_resolve_appeal', {
      p_admin_id: ADMIN,
      p_appeal_id: APPEAL,
      p_decision: 'uphold',
      p_note: 'Có bản thảo gốc',
    });
    expect(notifications.notify).toHaveBeenCalledWith(
      OWNER,
      'moderation.appeal_upheld',
      expect.objectContaining({ projectName: 'Song', note: 'Có bản thảo gốc' }),
    );
    expect(moderation.notifyForkOwners).toHaveBeenCalledWith(
      [{ projectId: FORK, ownerId: FORK_OWNER, name: 'Remix' }],
      'moderation.project_restored',
    );
  });

  it('UTCID02 bác bỏ không khôi phục fork nào', async () => {
    const { service } = build(
      {},
      {
        admin_resolve_appeal: {
          data: [
            {
              o_status: 'rejected',
              o_appellant_id: OWNER,
              o_project_id: PROJECT,
              o_project_name: 'Song',
              o_restored_forks: [],
            },
          ],
          error: null,
        },
      },
    );
    await expect(
      service.resolveAppeal(ADMIN, APPEAL, 'reject', 'Không đủ chứng cứ'),
    ).resolves.toEqual({ status: 'rejected', restoredForks: 0 });
  });

  it('UTCID04 kháng cáo không còn thuộc lần gỡ hiện tại thì 409, không báo ai', async () => {
    const { service, notifications } = build(
      {},
      {
        admin_resolve_appeal: {
          data: [
            {
              o_status: 'stale',
              o_appellant_id: OWNER,
              o_project_id: PROJECT,
              o_project_name: 'Song',
              o_restored_forks: [],
            },
          ],
          error: null,
        },
      },
    );
    await expect(
      service.resolveAppeal(ADMIN, APPEAL, 'uphold', 'Đã xem xét kỹ'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(notifications.notify).not.toHaveBeenCalled();
  });

  it('UTCID03 kháng cáo đã xử lý rồi thì 409, không tồn tại thì 404', async () => {
    const resolved = build(
      {},
      {
        admin_resolve_appeal: {
          data: null,
          error: { message: 'ALREADY_RESOLVED' },
        },
      },
    );
    await expect(
      resolved.service.resolveAppeal(ADMIN, APPEAL, 'uphold', 'Đã xem xét kỹ'),
    ).rejects.toBeInstanceOf(ConflictException);

    const missing = build(
      {},
      {
        admin_resolve_appeal: {
          data: null,
          error: { message: 'APPEAL_NOT_FOUND' },
        },
      },
    );
    await expect(
      missing.service.resolveAppeal(ADMIN, APPEAL, 'uphold', 'Đã xem xét kỹ'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
