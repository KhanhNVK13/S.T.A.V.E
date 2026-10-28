import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import type { NotificationsService } from '../notifications/notifications.service';
import { ForksService } from './forks.service';

const projectId = '33333333-3333-4333-8333-333333333333';
const ownerId = '44444444-4444-4444-8444-444444444444';
const userId = '55555555-5555-4555-8555-555555555555';
const newId = '66666666-6666-4666-8666-666666666666';

function source(overrides: Record<string, unknown> = {}) {
  return {
    id: projectId,
    name: 'Bài hát',
    owner_id: ownerId,
    visibility: 'public',
    archived_at: null,
    moderation_hidden_at: null,
    ...overrides,
  };
}

function makeService(
  tables: SupabaseMockOptions['tables'],
  rpc: SupabaseMockOptions['rpc'] = {
    fork_project: { data: newId, error: null },
  },
) {
  const mock = createSupabaseMock([], { tables, rpc });
  const notify = jest.fn().mockResolvedValue(undefined);
  const service = new ForksService(mock.client, {
    notify,
  } as unknown as NotificationsService);
  return { service, notify, ...mock };
}

const baseTables = (extra: Record<string, unknown> = {}) =>
  ({
    projects: [{ data: source() }],
    users: [
      { data: { status: 'active' } },
      { data: { display_name: 'An', username: 'an' } },
    ],
    ...extra,
  }) as SupabaseMockOptions['tables'];

describe('ForksService.fork', () => {
  it('forks a public project of someone else and notifies the owner', async () => {
    const { service, notify, rpc } = makeService(baseTables());
    await expect(service.fork(projectId, userId)).resolves.toEqual({
      id: newId,
    });
    expect(rpc).toHaveBeenCalledWith('fork_project', {
      p_source: projectId,
      p_new_owner: userId,
      p_name: 'Bài hát',
    });
    expect(notify).toHaveBeenCalledWith(ownerId, 'fork.created', {
      forkerName: 'An',
      projectName: 'Bài hát',
      projectId,
    });
  });

  it('answers not found for a missing or hidden project', async () => {
    const missing = makeService({ projects: [{ data: null }] });
    await expect(
      missing.service.fork(projectId, userId),
    ).rejects.toBeInstanceOf(NotFoundException);

    const hidden = makeService({
      projects: [{ data: source({ moderation_hidden_at: '2026-10-20' }) }],
    });
    await expect(hidden.service.fork(projectId, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(hidden.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['a private project', { visibility: 'private' }],
    ['an archived project', { archived_at: '2026-10-20' }],
  ])('refuses %s as no longer available', async (_label, overrides) => {
    const { service, rpc } = makeService({
      projects: [{ data: source(overrides) }],
      users: [{ data: { status: 'active' } }],
    });
    await expect(service.fork(projectId, userId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('answers not found when the owner account is suspended', async () => {
    const { service, rpc } = makeService({
      projects: [{ data: source() }],
      users: [{ data: { status: 'suspended' } }],
    });
    await expect(service.fork(projectId, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('refuses to fork your own project', async () => {
    const { service, rpc } = makeService({
      projects: [{ data: source() }],
      users: [{ data: { status: 'active' } }],
    });
    await expect(service.fork(projectId, ownerId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it('keeps the original name even when the caller already has a project with that name', async () => {
    const { service, rpc } = makeService(baseTables());
    await service.fork(projectId, userId);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(
      'fork_project',
      expect.objectContaining({ p_name: 'Bài hát' }),
    );
  });

  it('cuts a name longer than 100 characters', async () => {
    const long = 'a'.repeat(120);
    const { service, rpc } = makeService({
      projects: [{ data: source({ name: long }) }],
      users: [
        { data: { status: 'active' } },
        { data: { display_name: 'An', username: 'an' } },
      ],
    });
    await service.fork(projectId, userId);
    expect(rpc).toHaveBeenCalledWith(
      'fork_project',
      expect.objectContaining({ p_name: 'a'.repeat(100) }),
    );
  });

  it('reports a failure of the copy and sends no notification', async () => {
    const { service, notify } = makeService(baseTables(), {
      fork_project: { data: null, error: { code: 'XX000', message: 'boom' } },
    });
    await expect(service.fork(projectId, userId)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
    expect(notify).not.toHaveBeenCalled();
  });
});
