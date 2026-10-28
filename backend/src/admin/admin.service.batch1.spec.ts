import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import type { AudioSketchesService } from '../audio-sketches/audio-sketches.service';
import { AdminService } from './admin.service';
import { AccountRemovalService } from '../account-removal/account-removal.service';

const adminId = '11111111-1111-4111-8111-111111111111';
const targetId = '22222222-2222-4222-8222-222222222222';

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: targetId,
    username: 'target',
    status: 'suspended',
    role: 'user',
    ...overrides,
  };
}

function makeService(
  tables: Record<string, Array<Record<string, unknown>>>,
  authAdmin: Record<string, Array<Record<string, unknown>>> = {},
) {
  const mock = createSupabaseMock([], { tables, authAdmin });
  const customSounds = {
    removeAllFilesOf: jest.fn().mockResolvedValue(undefined),
    collectGarbage: jest.fn().mockResolvedValue(undefined),
  } as unknown as CustomSoundsService;
  const audioSketches = {
    purgeProjectFiles: jest.fn().mockResolvedValue(undefined),
  } as unknown as AudioSketchesService;
  return {
    service: new AdminService(
      mock.client,
      new AccountRemovalService(mock.client, audioSketches, customSounds),
    ),
    ...mock,
  };
}

describe('AdminService.listUsers', () => {
  const baseUsers = [
    {
      id: targetId,
      username: 'target',
      display_name: 'Target',
      email: 'target@stave.io',
      status: 'suspended',
      role: 'user',
      created_at: '2026-10-01T00:00:00.000Z',
    },
  ];

  it('adds project counts from one grouped query and the latest suspension', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        users: [{ data: baseUsers, count: 1 }],
        admin_audit_log: [
          {
            data: [
              {
                target_id: targetId,
                reason: 'Spam: newest',
                created_at: '2026-10-05T00:00:00.000Z',
              },
              {
                target_id: targetId,
                reason: 'older',
                created_at: '2026-10-02T00:00:00.000Z',
              },
            ],
          },
        ],
      },
      rpc: {
        admin_project_counts: {
          data: [{ owner_id: targetId, project_count: 3 }],
        },
      },
    });
    const service = new AdminService(
      mock.client,
      {} as unknown as AccountRemovalService,
    );

    const result = await service.listUsers({});

    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith('admin_project_counts', {
      p_owner_ids: [targetId],
    });
    expect(result.users[0].projectCount).toBe(3);
    expect(result.users[0].suspension).toEqual({
      reason: 'Spam: newest',
      suspendedAt: '2026-10-05T00:00:00.000Z',
    });
  });

  it('reports zero projects for owners missing from the grouped result', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        users: [{ data: [{ ...baseUsers[0], status: 'active' }], count: 1 }],
      },
      rpc: { admin_project_counts: { data: [] } },
    });
    const service = new AdminService(
      mock.client,
      {} as unknown as AccountRemovalService,
    );

    const result = await service.listUsers({});

    expect(result.users[0].projectCount).toBe(0);
    expect(result.users[0].suspension).toBeNull();
  });

  it('fails when the count query fails', async () => {
    const mock = createSupabaseMock([], {
      tables: { users: [{ data: baseUsers, count: 1 }] },
      rpc: { admin_project_counts: { data: null, error: { message: 'down' } } },
    });
    const service = new AdminService(
      mock.client,
      {} as unknown as AccountRemovalService,
    );

    await expect(service.listUsers({})).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('AdminService.reactivateUser', () => {
  it('refuses to reactivate an administrator account', async () => {
    const { service } = makeService({
      users: [{ data: user({ role: 'admin' }) }],
    });
    await expect(
      service.reactivateUser(adminId, targetId, 'reason'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses when the account is not suspended', async () => {
    const { service } = makeService({
      users: [{ data: user({ status: 'active' }) }],
    });
    await expect(
      service.reactivateUser(adminId, targetId, 'reason'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AdminService.removeUser', () => {
  it('keeps the account when the credentials cannot be deleted', async () => {
    const { service, builders } = makeService(
      {
        users: [{ data: user({ status: 'active' }) }],
        sessions: [{ data: null, error: null }],
        projects: [{ data: [] }],
      },
      { deleteUser: [{ data: null, error: { status: 500 } }] },
    );
    await expect(
      service.removeUser(adminId, targetId, 'reason', 'target'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(builders.users.delete).not.toHaveBeenCalled();
  });

  it('reports failure when the profile row cannot be deleted', async () => {
    const { service, builders } = makeService(
      {
        users: [
          { data: user({ status: 'active' }) },
          { data: null, error: { message: 'fk' } },
        ],
        sessions: [{ data: null, error: null }],
        projects: [{ data: [] }],
        admin_audit_log: [{ data: null, error: null }],
      },
      { deleteUser: [{ data: null, error: null }] },
    );
    await expect(
      service.removeUser(adminId, targetId, 'reason', 'target'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);
    expect(builders.admin_audit_log.insert).not.toHaveBeenCalled();
  });

  it('writes the audit entry only after the account is gone', async () => {
    const { service, builders } = makeService(
      {
        users: [
          { data: user({ status: 'active' }) },
          { data: null, error: null },
        ],
        sessions: [{ data: null, error: null }],
        projects: [{ data: [] }],
        admin_audit_log: [{ data: null, error: null }],
      },
      { deleteUser: [{ data: null, error: null }] },
    );
    await service.removeUser(adminId, targetId, 'reason', 'target');
    expect(builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'remove_user', target_id: targetId }),
    );
  });
});
