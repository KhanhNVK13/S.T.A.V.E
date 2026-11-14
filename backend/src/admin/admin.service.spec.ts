import { AdminService } from './admin.service';
import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import type { AudioSketchesService } from '../audio-sketches/audio-sketches.service';
import { AccountRemovalService } from '../account-removal/account-removal.service';
import { AccountBillingCancellation } from '../billing/account-billing-cancellation.service';
import type { PaymentGateway } from '../billing/payment-gateway';
import type { JamService } from '../jam/jam.service';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { maskEmail } from '../common/utils/mask-email.util';

// ============================================================================
// SHEET: BE-ADM-01 (AdminService.listUsers)
// ============================================================================
describe('BE-ADM-01 AdminService.listUsers(query)', () => {
  const row = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'usr_1',
      email: 'user@stave.io',
      password_hash: null,
      google_id: null,
      display_name: 'Test User',
      username: 'testuser',
      bio: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      status: 'active',
      active_theme_id: null,
      role: 'user',
      ...overrides,
    }) as unknown;

  const makeService = (usersResult: QueryResult) => {
    const mock = createSupabaseMock([], {
      tables: { users: [usersResult], admin_audit_log: [{ data: [] }] },
      rpc: { admin_project_counts: { data: [], error: null } },
    });
    const service = new AdminService(
      mock.client,
      {} as unknown as AccountRemovalService,
    );
    return { service, mock };
  };

  it('UTCID01 returns page 1/20 with masked email plus the SRS-required plan and project count', async () => {
    const { service } = makeService({
      data: [row()],
      count: 5,
      error: null,
    });

    const result = await service.listUsers({});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.total).toBe(5);
    const first = result.users[0] as Record<string, unknown>;
    expect(first.maskedEmail).toBe(maskEmail('user@stave.io'));
    expect(first.status).toBe('active');
    expect(first.projectCount).toBeDefined();
  });

  it('UTCID02 maps page 2 / limit 10 to range(10,19)', async () => {
    const { service, mock } = makeService({
      data: [row()],
      count: 25,
      error: null,
    });

    const result = await service.listUsers({ page: 2, limit: 10 });

    expect(mock.builders.users.range).toHaveBeenCalledWith(10, 19);
    expect(result.page).toBe(2);
    expect(result.limit).toBe(10);
  });

  it('UTCID03 maps page 1 / limit 100 to range(0,99)', async () => {
    const { service, mock } = makeService({
      data: [row()],
      count: 100,
      error: null,
    });

    await service.listUsers({ page: 1, limit: 100 });

    expect(mock.builders.users.range).toHaveBeenCalledWith(0, 99);
  });

  it('UTCID04 filters by status = suspended', async () => {
    const { service, mock } = makeService({
      data: [row({ status: 'suspended' })],
      count: 1,
      error: null,
    });

    await service.listUsers({ status: 'suspended' });

    expect(mock.builders.users.eq).toHaveBeenCalledWith('status', 'suspended');
    expect(mock.builders.users.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('UTCID05 searches by handle/display/email with an or() filter', async () => {
    const { service, mock } = makeService({
      data: [row()],
      count: 1,
      error: null,
    });

    await service.listUsers({ search: 'khanh' });

    expect(mock.builders.users.or).toHaveBeenCalledWith(
      'username.ilike.%khanh%,display_name.ilike.%khanh%,email.eq.khanh',
    );
  });

  it('UTCID06 trims a padded search term before building the or() filter', async () => {
    const { service, mock } = makeService({
      data: [row()],
      count: 1,
      error: null,
    });

    await service.listUsers({ search: '  khanh  ' });

    expect(mock.builders.users.or).toHaveBeenCalledWith(
      'username.ilike.%khanh%,display_name.ilike.%khanh%,email.eq.khanh',
    );
  });

  it('UTCID07 falls back to total = users.length when count is null', async () => {
    const { service } = makeService({
      data: [row(), row({ id: 'usr_2' })],
      count: null,
      error: null,
    });

    const result = await service.listUsers({});

    expect(result.total).toBe(2);
    expect(result.users).toHaveLength(2);
  });

  it('UTCID08 returns { total: 0, users: [] } for an empty filtered list', async () => {
    const { service } = makeService({
      data: [],
      count: null,
      error: null,
    });

    const result = await service.listUsers({ status: 'suspended' });

    expect(result.total).toBe(0);
    expect(result.users).toEqual([]);
  });

  it('UTCID09 throws BadRequestException when the query errors', async () => {
    const { service } = makeService({
      data: null,
      count: null,
      error: { message: 'db error' },
    });

    await expect(service.listUsers({})).rejects.toThrow(
      new BadRequestException('Could not list users'),
    );
  });

  it('UTCID10 still throws BadRequestException when a comma-laden search query errors', async () => {
    const { service } = makeService({
      data: null,
      count: null,
      error: { message: 'db error' },
    });

    await expect(service.listUsers({ search: 'a,b' })).rejects.toThrow(
      new BadRequestException('Could not list users'),
    );
  });
});

// ============================================================================
// SHEET: BE-ADM-02 (AdminService.suspendUser)
// ============================================================================
describe('BE-ADM-02 AdminService.suspendUser(adminId, targetId, reason)', () => {
  const ok: QueryResult = { data: null, error: null };

  const makeSuspend = (
    usersResults: QueryResult[],
    opts: {
      sessions?: QueryResult[];
      audit?: QueryResult[];
      notifications?: QueryResult[];
      projects?: QueryResult[];
      updateUserById?: QueryResult | QueryResult[];
      jam?: { removeUserFromRooms: jest.Mock };
    } = {},
  ) => {
    const mock = createSupabaseMock([], {
      tables: {
        users: usersResults,
        sessions: opts.sessions ?? [ok],
        admin_audit_log: opts.audit ?? [ok],
        notifications: opts.notifications ?? [ok],
        projects: opts.projects ?? [],
      },
      authAdmin: {
        updateUserById: opts.updateUserById ?? ok,
      },
    });
    const service = new AdminService(
      mock.client,
      {} as unknown as AccountRemovalService,
      undefined,
      opts.jam as unknown as JamService | undefined,
    );
    return { service, mock };
  };

  const row = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'usr_2',
      email: 'user@stave.io',
      password_hash: null,
      google_id: null,
      display_name: 'Test User',
      username: 'testuser',
      bio: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      status: 'active',
      active_theme_id: null,
      role: 'user',
      ...overrides,
    }) as unknown;

  it('UTCID01 suspends the account, ends sessions, and records audit + notification', async () => {
    const { service, mock } = makeSuspend(
      [
        { data: row() }, // getTarget -> active user
        ok, // users.update -> suspended
      ],
      { projects: [ok] },
    );

    await expect(
      service.suspendUser('usr_1', 'usr_2', 'Spam uploads'),
    ).resolves.toBeUndefined();

    expect(mock.builders.users.update).toHaveBeenCalledWith({
      status: 'suspended',
    });
    expect(mock.builders.users.eq).toHaveBeenCalledWith('id', 'usr_2');
    expect(mock.builders.sessions.update).toHaveBeenCalledWith({
      revoked_at: expect.any(String),
    });
    expect(mock.builders.sessions.eq).toHaveBeenCalledWith('user_id', 'usr_2');
    expect(mock.auth.admin.updateUserById).toHaveBeenCalledWith('usr_2', {
      ban_duration: expect.any(String),
    });
    expect(mock.builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: 'usr_1',
        action: 'suspend_user',
        target_id: 'usr_2',
        reason: 'Spam uploads',
      }),
    );
    expect(mock.builders.notifications.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'usr_2', type: 'account_suspended' }),
    );
  });

  it('UTCID02 suspends with a 1-character reason (boundary of the policy note)', async () => {
    const { service, mock } = makeSuspend([{ data: row() }, ok], {
      projects: [ok],
    });

    await expect(
      service.suspendUser('usr_1', 'usr_2', 'x'),
    ).resolves.toBeUndefined();

    expect(mock.builders.users.update).toHaveBeenCalledWith({
      status: 'suspended',
    });
    expect(mock.builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'x' }),
    );
  });

  it('UTCID03 throws NotFoundException when the target does not exist', async () => {
    const { service } = makeSuspend([{ data: null, error: null }]);

    await expect(
      service.suspendUser('usr_1', 'usr_404', 'Spam uploads'),
    ).rejects.toThrow(new NotFoundException('User not found'));
  });

  it('UTCID04 throws NotFoundException when the target lookup returns an error', async () => {
    const { service } = makeSuspend([
      { data: null, error: { message: 'lookup failed' } },
    ]);

    await expect(
      service.suspendUser('usr_1', 'usr_2', 'Spam uploads'),
    ).rejects.toThrow(new NotFoundException('User not found'));
  });

  it('UTCID05 refuses to suspend an administrator account', async () => {
    const { service } = makeSuspend([{ data: row({ role: 'admin' }) }]);

    await expect(
      service.suspendUser('usr_1', 'usr_2', 'Spam uploads'),
    ).rejects.toThrow(
      new ForbiddenException(
        'Cannot act on an administrator account or your own account',
      ),
    );
  });

  it('UTCID06 refuses to suspend the acting administrator themself', async () => {
    const { service } = makeSuspend([
      { data: row({ id: 'usr_1', username: 'boss' }) },
    ]);

    await expect(
      service.suspendUser('usr_1', 'usr_1', 'Spam uploads'),
    ).rejects.toThrow(
      new ForbiddenException(
        'Cannot act on an administrator account or your own account',
      ),
    );
  });

  it('UTCID07 rejects a target that is already suspended', async () => {
    const { service } = makeSuspend([{ data: row({ status: 'suspended' }) }]);

    await expect(
      service.suspendUser('usr_1', 'usr_2', 'Spam uploads'),
    ).rejects.toThrow(new BadRequestException('Account is not active'));
  });

  it('UTCID08 rejects a target that has been removed', async () => {
    const { service } = makeSuspend([{ data: row({ status: 'removed' }) }]);

    await expect(
      service.suspendUser('usr_1', 'usr_2', 'Spam uploads'),
    ).rejects.toThrow(new BadRequestException('Account is not active'));
  });

  it('UTCID09 reports the failure when the users update errors and leaves the account active', async () => {
    const { service, mock } = makeSuspend([
      { data: row() },
      { data: null, error: { message: 'update failed' } },
    ]);

    await expect(
      service.suspendUser('usr_1', 'usr_2', 'Spam uploads'),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    // UC-97 4.E1: a failed update is reported; side effects that mutate
    // auth state must not run on a broken transaction.
    expect(mock.auth.admin.updateUserById).not.toHaveBeenCalled();
  });

  it('UTCID10 removes the suspended user from the live jam rooms', async () => {
    const jam = { removeUserFromRooms: jest.fn().mockReturnValue(1) };
    const { service } = makeSuspend([{ data: row() }, ok], {
      projects: [ok],
      jam,
    });

    await expect(
      service.suspendUser('usr_1', 'usr_2', 'Spam uploads'),
    ).resolves.toBeUndefined();

    expect(jam.removeUserFromRooms).toHaveBeenCalledWith('usr_2');
  });

  it('UTCID11 still completes the suspension when the jam removal fails', async () => {
    const jam = {
      removeUserFromRooms: jest.fn(() => {
        throw new Error('jam down');
      }),
    };
    const { service, mock } = makeSuspend([{ data: row() }, ok], {
      projects: [ok],
      jam,
    });

    await expect(
      service.suspendUser('usr_1', 'usr_2', 'Spam uploads'),
    ).resolves.toBeUndefined();

    expect(mock.builders.admin_audit_log.insert).toHaveBeenCalled();
  });
});

// ============================================================================
// SHEET: BE-ADM-03 (AdminService.reactivateUser)
// ============================================================================
describe('BE-ADM-03 AdminService.reactivateUser(adminId, targetId, reason)', () => {
  const ok: QueryResult = { data: null, error: null };

  const makeReactivate = (
    usersResults: QueryResult[],
    opts: {
      audit?: QueryResult[];
      notifications?: QueryResult[];
      updateUserById?: QueryResult | QueryResult[];
    } = {},
  ) => {
    const mock = createSupabaseMock([], {
      tables: {
        users: usersResults,
        admin_audit_log: opts.audit ?? [ok],
        notifications: opts.notifications ?? [ok],
      },
      authAdmin: { updateUserById: opts.updateUserById ?? ok },
    });
    const service = new AdminService(
      mock.client,
      {} as unknown as AccountRemovalService,
    );
    return { service, mock };
  };

  const row = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'usr_2',
      email: 'user@stave.io',
      password_hash: null,
      google_id: null,
      display_name: 'Test User',
      username: 'testuser',
      bio: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      status: 'suspended',
      active_theme_id: null,
      role: 'user',
      ...overrides,
    }) as unknown;

  it('UTCID01 reactivates a suspended account, lifts the ban, and records audit + notification', async () => {
    const { service, mock } = makeReactivate([{ data: row() }, ok]);

    await expect(
      service.reactivateUser('usr_1', 'usr_2', 'Appeal accepted'),
    ).resolves.toBeUndefined();

    expect(mock.builders.users.update).toHaveBeenCalledWith({
      status: 'active',
    });
    expect(mock.builders.users.eq).toHaveBeenCalledWith('id', 'usr_2');
    expect(mock.auth.admin.updateUserById).toHaveBeenCalledWith('usr_2', {
      ban_duration: 'none',
    });
    expect(mock.builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: 'usr_1',
        action: 'reactivate_user',
        target_id: 'usr_2',
        reason: 'Appeal accepted',
      }),
    );
    expect(mock.builders.notifications.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'usr_2',
        type: 'account_reactivated',
      }),
    );
  });

  it('UTCID02 reactivates with a 1-character reason (boundary)', async () => {
    const { service, mock } = makeReactivate([{ data: row() }, ok]);

    await expect(
      service.reactivateUser('usr_1', 'usr_2', 'x'),
    ).resolves.toBeUndefined();

    expect(mock.builders.users.update).toHaveBeenCalledWith({
      status: 'active',
    });
    expect(mock.builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'x' }),
    );
  });

  it('UTCID03 rejects a target that is already active', async () => {
    const { service } = makeReactivate([{ data: row({ status: 'active' }) }]);

    await expect(
      service.reactivateUser('usr_1', 'usr_2', 'Appeal accepted'),
    ).rejects.toThrow(new BadRequestException('Account is not suspended'));
  });

  it('UTCID04 rejects a target that has been removed', async () => {
    const { service } = makeReactivate([{ data: row({ status: 'removed' }) }]);

    await expect(
      service.reactivateUser('usr_1', 'usr_2', 'Appeal accepted'),
    ).rejects.toThrow(new BadRequestException('Account is not suspended'));
  });

  it('UTCID05 throws NotFoundException when the target does not exist', async () => {
    const { service } = makeReactivate([{ data: null, error: null }]);

    await expect(
      service.reactivateUser('usr_1', 'usr_404', 'Appeal accepted'),
    ).rejects.toThrow(new NotFoundException('User not found'));
  });

  it('UTCID06 refuses to reactivate an administrator account (SRS BR-110)', async () => {
    const { service } = makeReactivate([{ data: row({ role: 'admin' }) }, ok]);

    await expect(
      service.reactivateUser('usr_1', 'usr_2', 'Appeal accepted'),
    ).rejects.toThrow(
      new ForbiddenException(
        'Cannot act on an administrator account or your own account',
      ),
    );
  });

  it('UTCID07 refuses to reactivate the acting administrator themself (SRS BR-110)', async () => {
    const { service } = makeReactivate([
      { data: row({ id: 'usr_1', username: 'boss' }) },
      ok,
    ]);

    await expect(
      service.reactivateUser('usr_1', 'usr_1', 'Appeal accepted'),
    ).rejects.toThrow(
      new ForbiddenException(
        'Cannot act on an administrator account or your own account',
      ),
    );
  });
});

// ============================================================================
// SHEET: BE-ADM-04 (AdminService.removeUser)
// ============================================================================
describe('BE-ADM-04 AdminService.removeUser(adminId, targetId, reason, confirmUsername)', () => {
  const ok: QueryResult = { data: null, error: null };

  const makeRemove = (
    usersResults: QueryResult[],
    opts: {
      sessions?: QueryResult[];
      audit?: QueryResult[];
      notifications?: QueryResult[];
      emailSender?: { enabled: boolean; send: jest.Mock };
      gateway?: { cancelPayment: jest.Mock };
      transactions?: QueryResult[];
      deleteUser?: QueryResult | QueryResult[];
      sounds?: {
        removeAllFilesOf?: jest.Mock;
        collectGarbage?: jest.Mock;
      };
    } = {},
  ) => {
    const mock = createSupabaseMock([], {
      tables: {
        users: usersResults,
        projects: [{ data: [], error: null }],
        sessions: opts.sessions ?? [ok],
        admin_audit_log: opts.audit ?? [ok],
        notifications: opts.notifications ?? [ok],
        ...(opts.gateway
          ? {
              transactions: opts.transactions ?? [{ data: [], error: null }],
              subscriptions: [ok],
            }
          : {}),
      },
      authAdmin: {
        getUserById: { data: { user: { banned_until: null } }, error: null },
        deleteUser: opts.deleteUser ?? ok,
        updateUserById: [ok, ok],
      },
    });
    const sounds = {
      removeAllFilesOf:
        opts.sounds?.removeAllFilesOf ?? jest.fn(() => Promise.resolve()),
      collectGarbage:
        opts.sounds?.collectGarbage ?? jest.fn(() => Promise.resolve()),
    };
    const sketches = {
      purgeProjectFiles: jest.fn(() => Promise.resolve()),
    };
    const service = new AdminService(
      mock.client,
      new AccountRemovalService(
        mock.client,
        sketches as unknown as AudioSketchesService,
        sounds as unknown as CustomSoundsService,
        opts.gateway
          ? new AccountBillingCancellation(
              mock.client,
              opts.gateway as unknown as PaymentGateway,
            )
          : undefined,
      ),
      opts.emailSender,
    );
    return { service, mock, sounds };
  };

  const row = (overrides: Record<string, unknown> = {}) =>
    ({
      id: 'usr_2',
      email: 'user@stave.io',
      password_hash: null,
      google_id: null,
      display_name: 'Test User',
      username: 'khanh_01',
      bio: null,
      avatar_url: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      status: 'active',
      active_theme_id: null,
      role: 'user',
      ...overrides,
    }) as unknown;

  it('UTCID01 deletes the user and files, notifies the holder, and logs the audit', async () => {
    const { service, mock, sounds } = makeRemove([{ data: row() }, ok]);

    await expect(
      service.removeUser('usr_1', 'usr_2', 'Spam uploads', 'khanh_01'),
    ).resolves.toBeUndefined();

    expect(mock.builders.users.delete).toHaveBeenCalled();
    expect(mock.builders.users.eq).toHaveBeenCalledWith('id', 'usr_2');
    expect(mock.builders.sessions.update).toHaveBeenCalledWith({
      revoked_at: expect.any(String),
    });
    expect(mock.auth.admin.deleteUser).toHaveBeenCalledWith('usr_2');
    expect(sounds.removeAllFilesOf).toHaveBeenCalledWith('usr_2');
    expect(sounds.collectGarbage).toHaveBeenCalled();
    expect(mock.builders.admin_audit_log.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        admin_id: 'usr_1',
        action: 'remove_user',
        target_id: 'usr_2',
        reason: 'Spam uploads',
      }),
    );
  });

  it('UTCID02 throws NotFoundException when the target does not exist', async () => {
    const { service } = makeRemove([{ data: null, error: null }]);

    await expect(
      service.removeUser('usr_1', 'usr_404', 'Spam uploads', 'khanh_01'),
    ).rejects.toThrow(new NotFoundException('User not found'));
  });

  it('UTCID03 refuses to remove an administrator account', async () => {
    const { service } = makeRemove([{ data: row({ role: 'admin' }) }]);

    await expect(
      service.removeUser('usr_1', 'usr_2', 'Spam uploads', 'khanh_01'),
    ).rejects.toThrow(
      new ForbiddenException(
        'Cannot act on an administrator account or your own account',
      ),
    );
  });

  it('UTCID04 refuses to remove the acting administrator themself', async () => {
    const { service } = makeRemove([
      { data: row({ id: 'usr_1', username: 'boss', role: 'admin' }) },
    ]);

    await expect(
      service.removeUser('usr_1', 'usr_1', 'Spam uploads', 'boss'),
    ).rejects.toThrow(
      new ForbiddenException(
        'Cannot act on an administrator account or your own account',
      ),
    );
  });

  it('UTCID05 rejects a confirmation whose case differs from the username', async () => {
    const { service } = makeRemove([{ data: row() }]);

    await expect(
      service.removeUser('usr_1', 'usr_2', 'Spam uploads', 'Khanh_01'),
    ).rejects.toThrow(
      new BadRequestException('Username confirmation does not match'),
    );
  });

  it('UTCID06 rejects an empty confirmation', async () => {
    const { service } = makeRemove([{ data: row() }]);

    await expect(
      service.removeUser('usr_1', 'usr_2', 'Spam uploads', ''),
    ).rejects.toThrow(
      new BadRequestException('Username confirmation does not match'),
    );
  });

  it('UTCID07 deletes the account first and still reports a storage cleanup failure', async () => {
    const { service, mock } = makeRemove([{ data: row() }, ok], {
      sounds: {
        removeAllFilesOf: jest
          .fn()
          .mockRejectedValue(new Error('storage cleanup failed')),
        collectGarbage: jest.fn(() => Promise.resolve()),
      },
    });

    await expect(
      service.removeUser('usr_1', 'usr_2', 'Spam uploads', 'khanh_01'),
    ).rejects.toThrow('storage cleanup failed');

    expect(mock.auth.admin.deleteUser).toHaveBeenCalledWith('usr_2');
    expect(mock.builders.users.delete).toHaveBeenCalled();
    expect(mock.builders.admin_audit_log.insert).toHaveBeenCalled();
  });

  it('UTCID08 emails the removal reason to the holder at the registered address', async () => {
    const emailSender = {
      enabled: true,
      send: jest.fn(() => Promise.resolve()),
    };
    const { service } = makeRemove([{ data: row() }, ok], { emailSender });

    await service.removeUser('usr_1', 'usr_2', 'Spam uploads', 'khanh_01');

    expect(emailSender.send).toHaveBeenCalledTimes(1);
    expect(emailSender.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@stave.io',
        text: expect.stringContaining('Spam uploads'),
      }),
    );
  });

  it('UTCID09 still removes the account when the removal email cannot be sent', async () => {
    const emailSender = {
      enabled: true,
      send: jest.fn(() => Promise.reject(new Error('smtp down'))),
    };
    const { service, mock } = makeRemove([{ data: row() }, ok], {
      emailSender,
    });

    await expect(
      service.removeUser('usr_1', 'usr_2', 'Spam uploads', 'khanh_01'),
    ).resolves.toBeUndefined();
    expect(mock.builders.users.delete).toHaveBeenCalled();
    expect(emailSender.send).toHaveBeenCalledTimes(1);
  });

  it('UTCID10 cancels the pending order and the subscription before removing the account', async () => {
    const gateway = { cancelPayment: jest.fn().mockResolvedValue(undefined) };
    const { service, mock } = makeRemove([{ data: row() }, ok], {
      gateway,
      transactions: [
        { data: [{ id: 't1', order_code: 987654 }], error: null },
        ok,
      ],
    });

    await expect(
      service.removeUser('usr_1', 'usr_2', 'Spam uploads', 'khanh_01'),
    ).resolves.toBeUndefined();

    expect(gateway.cancelPayment).toHaveBeenCalledWith(
      987654,
      expect.any(String),
    );
    expect(mock.builders.subscriptions.update).toHaveBeenCalledWith({
      status: 'canceled',
      pending_plan_id: null,
    });
    expect(mock.builders.users.delete).toHaveBeenCalled();
  });

  it('UTCID11 halts the removal entirely when the payment gateway is unreachable', async () => {
    const gateway = {
      cancelPayment: jest.fn().mockRejectedValue(new Error('gateway down')),
    };
    const { service, mock } = makeRemove([{ data: row() }, ok], {
      gateway,
      transactions: [{ data: [{ id: 't1', order_code: 987654 }], error: null }],
    });

    await expect(
      service.removeUser('usr_1', 'usr_2', 'Spam uploads', 'khanh_01'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(mock.builders.subscriptions.update).not.toHaveBeenCalled();
    expect(mock.builders.sessions.update).not.toHaveBeenCalled();
    expect(mock.builders.users.delete).not.toHaveBeenCalled();
    expect(mock.auth.admin.deleteUser).not.toHaveBeenCalled();
    expect(mock.builders.admin_audit_log.insert).not.toHaveBeenCalled();
  });
});
