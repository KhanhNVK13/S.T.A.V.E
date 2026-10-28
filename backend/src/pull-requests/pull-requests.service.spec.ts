import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
}));

import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import type { ProjectAccessService } from '../project-access/project-access.service';
import type { NotificationsService } from '../notifications/notifications.service';
import type { PullRequestAnalysisService } from './pull-request-analysis.service';
import { PullRequestsService } from './pull-requests.service';

const forkId = '11111111-1111-4111-8111-111111111111';
const originalId = '22222222-2222-4222-8222-222222222222';
const author = '33333333-3333-4333-8333-333333333333';
const owner = '44444444-4444-4444-8444-444444444444';
const stranger = '55555555-5555-4555-8555-555555555555';
const prId = '66666666-6666-4666-8666-666666666666';

function project(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: id === forkId ? 'Fork' : 'Gốc',
    owner_id: id === forkId ? author : owner,
    visibility: 'public',
    archived_at: null,
    moderation_hidden_at: null,
    forked_from_project_id: id === forkId ? originalId : null,
    ...overrides,
  };
}

function prRow(overrides: Record<string, unknown> = {}) {
  return {
    id: prId,
    number: 7,
    source_project_id: forkId,
    source_branch_id: 'sb',
    target_project_id: originalId,
    target_branch_id: 'tb',
    author_id: author,
    title: 'Thêm bè',
    description: '',
    status: 'open',
    created_at: '2026-10-27T00:00:00Z',
    closed_at: null,
    merge_commit_id: null,
    merge_branch_id: null,
    source_project_name: 'Fork',
    target_project_name: 'Gốc',
    source_branch_name: 'main',
    target_branch_name: 'main',
    new_commit_count: 2,
    has_conflicts: false,
    ...overrides,
  };
}

function makeService(options: {
  tables: SupabaseMockOptions['tables'];
  accessOf?: Record<string, string | null>;
  analysis?: Partial<Record<'analyze', jest.Mock>>;
}) {
  const mock = createSupabaseMock([], { tables: options.tables });
  const getAccess = jest
    .fn()
    .mockImplementation((_project: string, user: string) =>
      Promise.resolve(options.accessOf?.[user] ?? null),
    );
  const assertOwner = jest.fn().mockResolvedValue(undefined);
  const notify = jest.fn().mockResolvedValue(undefined);
  const analyze =
    options.analysis?.analyze ??
    jest.fn().mockResolvedValue({
      newCommits: [{ id: 'c1' }],
      conflictsCount: 0,
      summary: { summary: { notes: { added: 1 }, tracks: {} } },
    });
  const service = new PullRequestsService(
    mock.client,
    { getAccess, assertOwner } as unknown as ProjectAccessService,
    { analyze } as unknown as PullRequestAnalysisService,
    { notify } as unknown as NotificationsService,
  );
  return { service, notify, analyze, assertOwner, ...mock };
}

const createTables = (extra: SupabaseMockOptions['tables'] = {}) =>
  ({
    projects: [{ data: project(forkId) }, { data: project(originalId) }],
    branches: [
      { data: { id: 'sb', name: 'main', project_id: forkId } },
      { data: { id: 'tb', name: 'main', project_id: originalId } },
    ],
    pull_requests: [
      { data: null },
      { data: { id: prId, number: 7 }, error: null },
    ],
    users: [{ data: { display_name: 'An', username: 'an' } }],
    ...extra,
  }) as SupabaseMockOptions['tables'];

const dto = {
  sourceBranchId: 'sb',
  targetBranchId: 'tb',
  title: '  Thêm bè  ',
  description: 'mô tả',
};

describe('PullRequestsService.create', () => {
  it('stores the names and counts and notifies the owner of the original', async () => {
    const { service, builders, notify } = makeService({
      tables: createTables(),
    });
    await expect(service.create(forkId, author, dto)).resolves.toEqual({
      id: prId,
      number: 7,
    });
    expect(builders.pull_requests.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Thêm bè',
        source_project_name: 'Fork',
        target_project_name: 'Gốc',
        new_commit_count: 1,
        has_conflicts: false,
      }),
    );
    expect(notify).toHaveBeenCalledWith(
      owner,
      'pr.opened',
      expect.objectContaining({ pullRequestId: prId, projectName: 'Gốc' }),
    );
  });

  it.each([
    ['an empty title', '   ', BadRequestException],
    ['a title over 150 characters', 'a'.repeat(151), BadRequestException],
  ])('rejects %s', async (_label, title, error) => {
    const { service, builders } = makeService({ tables: createTables() });
    await expect(
      service.create(forkId, author, { ...dto, title }),
    ).rejects.toBeInstanceOf(error);
    expect(builders.projects.select).not.toHaveBeenCalled();
  });

  it('rejects a description over 2000 characters', async () => {
    const { service } = makeService({ tables: createTables() });
    await expect(
      service.create(forkId, author, { ...dto, description: 'a'.repeat(2001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only accepts a project that is a fork', async () => {
    const { service } = makeService({
      tables: createTables({
        projects: [{ data: project(forkId, { forked_from_project_id: null }) }],
      }),
    });
    await expect(service.create(forkId, author, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses when the original project is no longer public', async () => {
    const { service } = makeService({
      tables: createTables({
        projects: [
          { data: project(forkId) },
          { data: project(originalId, { visibility: 'private' }) },
        ],
      }),
    });
    await expect(service.create(forkId, author, dto)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses when the fork has nothing new', async () => {
    const { service } = makeService({
      tables: createTables(),
      analysis: {
        analyze: jest
          .fn()
          .mockResolvedValue({ newCommits: [], conflictsCount: 0 }),
      },
    });
    await expect(service.create(forkId, author, dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('points to the existing open pull request instead of creating a duplicate', async () => {
    const { service, builders } = makeService({
      tables: createTables({ pull_requests: [{ data: { id: 'existing' } }] }),
    });
    await expect(service.create(forkId, author, dto)).rejects.toMatchObject({
      response: { pullRequestId: 'existing' },
    });
    expect(builders.pull_requests.insert).not.toHaveBeenCalled();
  });

  it('marks the pull request as having conflicts', async () => {
    const { service, builders } = makeService({
      tables: createTables(),
      analysis: {
        analyze: jest
          .fn()
          .mockResolvedValue({ newCommits: [{ id: 'c1' }], conflictsCount: 3 }),
      },
    });
    await service.create(forkId, author, dto);
    expect(builders.pull_requests.insert).toHaveBeenCalledWith(
      expect.objectContaining({ has_conflicts: true }),
    );
  });
});

describe('PullRequestsService.loadForUser permissions', () => {
  const tables = (targetOverrides: Record<string, unknown> = {}) =>
    ({
      pull_requests: [{ data: prRow() }],
      projects: [{ data: project(originalId, targetOverrides) }],
    }) as SupabaseMockOptions['tables'];

  it('lets the owner of the original merge and close', async () => {
    const { service } = makeService({
      tables: tables(),
      accessOf: { [owner]: 'owner' },
    });
    const result = await service.loadForUser(prId, owner);
    expect(result.permissions).toEqual({
      canMerge: true,
      canClose: true,
      canComment: true,
    });
  });

  it('lets the author close but not merge', async () => {
    const { service } = makeService({ tables: tables() });
    const result = await service.loadForUser(prId, author);
    expect(result.permissions.canMerge).toBe(false);
    expect(result.permissions.canClose).toBe(true);
  });

  it('lets a stranger read a pull request of a public project without acting on it', async () => {
    const { service } = makeService({ tables: tables() });
    const result = await service.loadForUser(prId, stranger);
    expect(result.permissions.canMerge).toBe(false);
    expect(result.permissions.canClose).toBe(false);
    expect(result.permissions.canComment).toBe(true);
  });

  it('hides the pull request from a stranger when the original is private', async () => {
    const { service } = makeService({
      tables: tables({ visibility: 'private' }),
    });
    await expect(service.loadForUser(prId, stranger)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('keeps a pull request readable for its author after the original is deleted', async () => {
    const { service } = makeService({
      tables: {
        pull_requests: [{ data: prRow({ target_project_id: null }) }],
      },
    });
    const result = await service.loadForUser(prId, author);
    expect(result.targetProject).toBeNull();
    expect(result.permissions.canMerge).toBe(false);
  });

  it('answers not found for a missing pull request', async () => {
    const { service } = makeService({
      tables: { pull_requests: [{ data: null }] },
    });
    await expect(service.loadForUser(prId, author)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe('PullRequestsService.addComment', () => {
  const base = () =>
    ({
      pull_requests: [{ data: prRow() }],
      projects: [{ data: project(originalId) }],
      pull_request_comments: [
        {
          data: {
            id: 'c1',
            pull_request_id: prId,
            author_id: owner,
            body: 'Ổn',
            created_at: '2026-10-27T01:00:00Z',
          },
          error: null,
        },
      ],
      users: [
        { data: { display_name: 'Chủ', username: 'owner' } },
        {
          data: [
            {
              id: owner,
              username: 'owner',
              display_name: 'Chủ',
              avatar_url: null,
            },
          ],
        },
      ],
    }) as SupabaseMockOptions['tables'];

  it('rejects an empty comment and one over 2000 characters', async () => {
    const empty = makeService({
      tables: base(),
      accessOf: { [owner]: 'owner' },
    });
    await expect(
      empty.service.addComment(prId, owner, { body: '   ' }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const long = makeService({
      tables: base(),
      accessOf: { [owner]: 'owner' },
    });
    await expect(
      long.service.addComment(prId, owner, { body: 'a'.repeat(2001) }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('notifies the author but not the commenter', async () => {
    const { service, notify } = makeService({
      tables: base(),
      accessOf: { [owner]: 'owner' },
    });
    await service.addComment(prId, owner, { body: 'Ổn' });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      author,
      'pr.comment',
      expect.objectContaining({ pullRequestId: prId, title: 'Thêm bè' }),
    );
  });
});

describe('PullRequestsService.close', () => {
  const tables = (status = 'open') =>
    ({
      pull_requests: [
        { data: prRow({ status }) },
        { data: { id: prId }, error: null },
      ],
      projects: [{ data: project(originalId) }],
      pull_request_comments: [{ data: null, error: null }],
      users: [{ data: { display_name: 'An', username: 'an' } }],
    }) as SupabaseMockOptions['tables'];

  it('refuses to close a pull request that is no longer open', async () => {
    const { service } = makeService({
      tables: tables('merged'),
      accessOf: { [owner]: 'owner' },
    });
    await expect(service.close(prId, owner, {})).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('refuses a stranger', async () => {
    const { service } = makeService({ tables: tables() });
    await expect(service.close(prId, stranger, {})).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets the author withdraw and tells the owner of the original', async () => {
    const { service, notify, builders } = makeService({ tables: tables() });
    await service.close(prId, author, { comment: 'Rút lại' });
    expect(notify).toHaveBeenCalledWith(
      owner,
      'pr.closed',
      expect.objectContaining({ actorName: 'An' }),
    );
    expect(builders.pull_request_comments.insert).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Rút lại' }),
    );
  });

  it('tells the author when the owner of the original closes it', async () => {
    const { service, notify } = makeService({
      tables: tables(),
      accessOf: { [owner]: 'owner' },
    });
    await service.close(prId, owner, {});
    expect(notify).toHaveBeenCalledWith(
      author,
      'pr.closed',
      expect.objectContaining({ pullRequestId: prId }),
    );
  });
});

describe('PullRequestsService.listForProject', () => {
  it('hides a private project from people without access', async () => {
    const { service } = makeService({
      tables: {
        projects: [{ data: project(originalId, { visibility: 'private' }) }],
      },
    });
    await expect(
      service.listForProject(originalId, stranger),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('shows a stranger only the pull requests targeting the public project', async () => {
    const own = prRow({ id: 'own', target_project_id: originalId });
    const other = prRow({
      id: 'other',
      source_project_id: originalId,
      target_project_id: 'elsewhere',
    });
    const { service } = makeService({
      tables: {
        projects: [{ data: project(originalId) }],
        pull_requests: [{ data: [own, other] }],
        users: [{ data: [] }],
      },
    });
    const items = await service.listForProject(originalId, stranger);
    expect(items.map((i) => i.id)).toEqual(['own']);
  });
});

describe('PullRequestsService.targetBranches', () => {
  it('lists the branches of the original project, default first', async () => {
    const { service } = makeService({
      tables: {
        projects: [{ data: project(forkId) }, { data: project(originalId) }],
        branches: [
          {
            data: [
              { id: 'tb', name: 'main', is_default: true },
              { id: 'tb2', name: 'idea', is_default: false },
            ],
          },
        ],
      },
    });
    const result = await service.targetBranches(forkId, author);
    expect(result.targetProjectName).toBe('Gốc');
    expect(result.branches.map((b) => b.id)).toEqual(['tb', 'tb2']);
  });

  it('refuses when the original is no longer public', async () => {
    const { service } = makeService({
      tables: {
        projects: [
          { data: project(forkId) },
          { data: project(originalId, { visibility: 'private' }) },
        ],
      },
    });
    await expect(service.targetBranches(forkId, author)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('PullRequestsService.markMerged', () => {
  it('records the merge only while the pull request is still open', async () => {
    const { service, builders } = makeService({
      tables: { pull_requests: [{ data: { id: prId }, error: null }] },
    });
    await service.markMerged(prId, 'commit-1');
    expect(builders.pull_requests.eq).toHaveBeenCalledWith('status', 'open');
  });

  it('reports a conflict when someone else already finished it', async () => {
    const { service } = makeService({
      tables: { pull_requests: [{ data: null, error: null }] },
    });
    await expect(service.markMerged(prId, 'commit-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
