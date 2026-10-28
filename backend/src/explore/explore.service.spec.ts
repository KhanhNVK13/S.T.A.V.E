import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ExploreService, type PublicProjectCard } from './explore.service';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import type { PublicProjectsQueryDto } from '../projects/dto/public-projects-query.dto';

// ============================================================================
// SHEET: BE-EXP-01 (ExploreService.listPublicProjects)
//
// Mock order per call:
//   1. (tag) project_tags.getProjectIdsForTag
//   2. projects main select (multi-row await)
//   3. (items > 0) projects fork-counts + project_tags enrichment
// Per-table queues keep the order deterministic.
// ============================================================================
describe('BE-EXP-01 ExploreService.listPublicProjects(query)', () => {
  const card = (id: string, ownerId: string) => ({
    id,
    name: `Project ${id}`,
    description: null,
    genre: null,
    visibility: 'public' as const,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    play_count: 0,
    owner: {
      id: ownerId,
      username: 'owner',
      display_name: null,
      avatar_url: null,
    },
  });

  const rows25 = () =>
    Array.from({ length: 25 }, (_, i) => card(`p${i + 1}`, 'usr_active'));

  const makeService = (
    main: QueryResult,
    extra: {
      fork?: QueryResult;
      tagIds?: QueryResult;
      tags?: QueryResult;
    } = {},
  ) => {
    const tables: Record<string, QueryResult[]> = {
      projects: [main, ...(extra.fork ? [extra.fork] : [])],
    };
    const pt: QueryResult[] = [];
    if (extra.tagIds) pt.push(extra.tagIds);
    if (extra.tags) pt.push(extra.tags);
    if (pt.length > 0) tables.project_tags = pt;
    const mock = createSupabaseMock([], { tables });
    return { service: new ExploreService(mock.client), mock };
  };

  const call = (
    service: ExploreService,
    query: PublicProjectsQueryDto,
  ): Promise<Awaited<ReturnType<ExploreService['listPublicProjects']>>> =>
    service.listPublicProjects(query);

  it('UTCID01 returns 12 per page and totalPages 3 by default, ordered created_at desc', async () => {
    const { service, mock } = makeService(
      { data: rows25(), count: 25 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, { sort: 'newest' });

    expect(result.total).toBe(25);
    expect(result.limit).toBe(12);
    expect(result.totalPages).toBe(3);
    expect(mock.builders.projects.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('UTCID02 pages to range(24,35) on page 3 with limit 12', async () => {
    const { service, mock } = makeService(
      { data: rows25(), count: 25 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, { page: 3, limit: 12, sort: 'newest' });

    expect(mock.builders.projects.range).toHaveBeenCalledWith(24, 35);
    expect(result.page).toBe(3);
    expect(result.total).toBe(25);
  });

  it('UTCID03 returns totalPages 1 and up to 50 items on page 1 with limit 50', async () => {
    const { service, mock } = makeService(
      { data: rows25(), count: 25 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, { page: 1, limit: 50, sort: 'newest' });

    expect(mock.builders.projects.range).toHaveBeenCalledWith(0, 49);
    expect(result.totalPages).toBe(1);
    expect(result.limit).toBe(50);
  });

  it('UTCID04 orders by lifetime engagement for sort "popular"', async () => {
    const ids = ['p1', 'p2'];
    const mock = createSupabaseMock([], {
      tables: {
        project_engagement: [
          { data: ids.map((project_id) => ({ project_id })), count: 25 },
        ],
        projects: [
          { data: ids.map((id) => card(id, 'usr_active')) },
          { data: [] },
        ],
        project_tags: [{ data: [] }],
      },
    });
    const service = new ExploreService(mock.client);

    const result = await call(service, { sort: 'popular' });

    expect(mock.builders.project_engagement.order).toHaveBeenCalledWith(
      'score_all',
      { ascending: false },
    );
    expect(result.total).toBe(25);
    expect(result.items.map((i) => i.id)).toEqual(ids);
  });

  it('UTCID05 orders by lifetime engagement for sort "most_played"', async () => {
    const ids = ['p1', 'p2'];
    const mock = createSupabaseMock([], {
      tables: {
        project_engagement: [
          { data: ids.map((project_id) => ({ project_id })), count: 25 },
        ],
        projects: [
          { data: ids.map((id) => card(id, 'usr_active')) },
          { data: [] },
        ],
        project_tags: [{ data: [] }],
      },
    });
    const service = new ExploreService(mock.client);

    const result = await call(service, { sort: 'most_played' });

    expect(mock.builders.project_engagement.order).toHaveBeenCalledWith(
      'score_all',
      { ascending: false },
    );
    expect(result.total).toBe(25);
    expect(result.items.map((i) => i.id)).toEqual(ids);
  });

  it('UTCID06 falls back to 12 per page, created_at desc, totalPages 3 when sort is undefined', async () => {
    const { service, mock } = makeService(
      { data: rows25(), count: 25 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, {});

    expect(result.limit).toBe(12);
    expect(result.totalPages).toBe(3);
    expect(mock.builders.projects.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
  });

  it('UTCID07 applies ilike filters on genre and name', async () => {
    const { service, mock } = makeService(
      { data: rows25(), count: 25 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, {
      genre: 'lofi',
      search: 'piano',
      sort: 'newest',
    });

    expect(mock.builders.projects.ilike).toHaveBeenCalledWith(
      'genre',
      '%lofi%',
    );
    expect(mock.builders.projects.ilike).toHaveBeenCalledWith(
      'name',
      '%piano%',
    );
    expect(result.items).toHaveLength(25);
  });

  it('UTCID08 restricts the result to the ids of the 2 tagged projects', async () => {
    const { service, mock } = makeService(
      { data: [card('p1', 'usr_active'), card('p2', 'usr_active')], count: 2 },
      {
        tagIds: { data: [{ project_id: 'p1' }, { project_id: 'p2' }] },
        fork: { data: [] },
        tags: { data: [] },
      },
    );

    const result = await call(service, { tag: 'chill', sort: 'newest' });

    expect(mock.builders.projects.in).toHaveBeenCalledWith('id', ['p1', 'p2']);
    expect(result.items.map((i) => i.id)).toEqual(['p1', 'p2']);
  });

  it('UTCID09 returns items [], total 0 and totalPages 0 for a tag without projects', async () => {
    const { service } = makeService(
      { data: [], count: 0 },
      { tagIds: { data: [] } },
    );

    const result = await call(service, { tag: 'unknown', sort: 'newest' });

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
  });

  it('UTCID10 falls back to total 0 and totalPages 0 when count is null despite items', async () => {
    const { service } = makeService(
      { data: [card('p1', 'usr_active')], count: null },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, { sort: 'newest' });

    expect(result.total).toBe(0);
    expect(result.totalPages).toBe(0);
    expect(result.items).toHaveLength(1);
  });

  it('UTCID11 throws InternalServerErrorException when the query errors', async () => {
    const { service } = makeService({
      data: null,
      error: { message: 'db error' },
    });

    await expect(call(service, { sort: 'newest' })).rejects.toThrow(
      new InternalServerErrorException('Could not list public projects'),
    );
  });

  it('UTCID12 filters out projects owned by suspended accounts (BR-109)', async () => {
    const { service, mock } = makeService(
      { data: [card('pa', 'usr_active')], count: 1 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, { sort: 'newest' });

    expect(mock.builders.projects.eq).toHaveBeenCalledWith(
      'owner.status',
      'active',
    );
    expect(result.items.map((i) => i.id)).toEqual(['pa']);
  });
});

// ============================================================================
// SHEET: BE-EXP-02 (ExploreService.getPublicProject)
//
// Mock order per call:
//   1. projects maybeSingle (main select)
//   2. rpc increment_project_play_count (only when a row is returned)
//   3. enrichProjectCards: projects fork-counts + project_tags enrichment
//      (only when a row is returned)
// Per-table queues keep the order deterministic.
// ============================================================================
describe('BE-EXP-02 ExploreService.getPublicProject(id)', () => {
  const row = (ownerId: string) => ({
    id: 'proj_1',
    name: 'Detail Project',
    description: null,
    genre: null,
    visibility: 'public' as const,
    archived_at: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    play_count: 42,
    owner: {
      id: ownerId,
      username: 'owner',
      display_name: null,
      avatar_url: null,
    },
  });

  const makeService = (
    main: QueryResult,
    rpcResult?: QueryResult,
    extra: { fork?: QueryResult; tags?: QueryResult } = {},
  ) => {
    const tables: Record<string, QueryResult[]> = {
      projects: [main, ...(extra.fork ? [extra.fork] : [])],
      project_tags: extra.tags ? [extra.tags] : [],
    };
    const options: Parameters<typeof createSupabaseMock>[1] = { tables };
    if (rpcResult) {
      options.rpc = {
        increment_project_play_count: [rpcResult],
      };
    }
    const mock = createSupabaseMock([], options);
    return { service: new ExploreService(mock.client), mock };
  };

  it('UTCID01 returns the card without incrementing play_count on view, even when the RPC returns 43', async () => {
    const { service, mock } = makeService(
      { data: row('usr_active') },
      { data: 43 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await service.getPublicProject('proj_1');

    expect(result.id).toBe('proj_1');
    expect(mock.rpc).not.toHaveBeenCalled();
    expect(result.play_count).toBe(42);
  });

  it('UTCID02 returns the card with play_count left at 42 when the RPC returns an error', async () => {
    const { service } = makeService(
      { data: row('usr_active') },
      { data: null, error: { message: 'rpc failed' } },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await service.getPublicProject('proj_1');

    expect(result.id).toBe('proj_1');
    expect(result.play_count).toBe(42);
  });

  it('UTCID03 throws NotFoundException when the project is private', async () => {
    const { service } = makeService({ data: null });

    await expect(service.getPublicProject('proj_1')).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID04 throws NotFoundException when the project is archived', async () => {
    const { service } = makeService({ data: null });

    await expect(service.getPublicProject('proj_1')).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID05 throws NotFoundException when the project is moderation-hidden', async () => {
    const { service } = makeService({ data: null });

    await expect(service.getPublicProject('proj_1')).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID06 throws NotFoundException when the project id is not found', async () => {
    const { service } = makeService({ data: null });

    await expect(service.getPublicProject('nope')).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID07 throws NotFoundException when the Supabase select returns an error', async () => {
    const { service } = makeService({
      data: null,
      error: { message: 'db error' },
    });

    await expect(service.getPublicProject('proj_1')).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID08 throws NotFoundException for a public project of a suspended owner (BR-109)', async () => {
    const { service, mock } = makeService({ data: null });

    await expect(service.getPublicProject('proj_1')).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
    expect(mock.builders.projects.eq).toHaveBeenCalledWith(
      'owner.status',
      'active',
    );
  });
});

// ============================================================================
// SHEET: BE-EXP-03 (ExploreService.getPublicUserProfile)
//
// Mock order per call:
//   1. users maybeSingle (profile)
//   2. projects owned query (count exact) - error not checked
//   3. (ids > 0) projects fork query
// Per-table queues keep the order deterministic.
// ============================================================================
describe('BE-EXP-03 ExploreService.getPublicUserProfile(id)', () => {
  const userRow = {
    id: 'usr_1',
    username: 'creator',
    display_name: 'Creator',
    avatar_url: 'https://x.io/a.png',
    bio: 'bio',
    created_at: '2026-01-01T00:00:00Z',
    status: 'active',
  };

  const owned = (ids: string[], error = false): QueryResult => ({
    data: error ? null : ids.map((id) => ({ id })),
    error: error ? { message: 'db error' } : undefined,
    count: error ? null : ids.length,
  });

  const makeService = (user: QueryResult, projects?: QueryResult[]) => {
    const tables: Record<string, QueryResult[]> = { users: [user] };
    if (projects) tables.projects = projects;
    const mock = createSupabaseMock([], { tables });
    return { service: new ExploreService(mock.client), mock };
  };

  it('UTCID01 returns the profile with totals of 3 public projects and 5 forks', async () => {
    const { service, mock } = makeService({ data: userRow }, [
      owned(['p1', 'p2', 'p3']),
      { data: [], count: 5 },
    ]);

    const result = await service.getPublicUserProfile('usr_1');

    expect(result.username).toBe('creator');
    expect(result.bio).toBe('bio');
    expect(result.total_public_projects).toBe(3);
    expect(result.total_forks).toBe(5);
    expect(mock.builders.projects.in).toHaveBeenCalledWith(
      'forked_from_project_id',
      ['p1', 'p2', 'p3'],
    );
  });

  it('UTCID02 returns zero totals and skips the fork query when the user has no public projects', async () => {
    const { service, mock } = makeService({ data: userRow }, [owned([])]);

    const result = await service.getPublicUserProfile('usr_1');

    expect(result.total_public_projects).toBe(0);
    expect(result.total_forks).toBe(0);
    expect(mock.builders.projects.in).not.toHaveBeenCalled();
  });

  it('UTCID03 returns 3 public projects and 0 forks when nothing was forked', async () => {
    const { service } = makeService({ data: userRow }, [
      owned(['p1', 'p2', 'p3']),
      { data: [], count: 0 },
    ]);

    const result = await service.getPublicUserProfile('usr_1');

    expect(result.total_public_projects).toBe(3);
    expect(result.total_forks).toBe(0);
  });

  it('UTCID04 returns the profile with zero totals when the projects query errors', async () => {
    const { service } = makeService({ data: userRow }, [
      { data: null, error: { message: 'db error' }, count: null },
    ]);

    const result = await service.getPublicUserProfile('usr_1');

    expect(result.id).toBe('usr_1');
    expect(result.total_public_projects).toBe(0);
    expect(result.total_forks).toBe(0);
  });

  it('UTCID05 throws NotFoundException when the user is not found', async () => {
    const { service } = makeService({ data: null });

    await expect(service.getPublicUserProfile('nope')).rejects.toThrow(
      new NotFoundException('User not found'),
    );
  });

  it('UTCID06 throws NotFoundException when the user select returns an error', async () => {
    const { service } = makeService({
      data: null,
      error: { message: 'db error' },
    });

    await expect(service.getPublicUserProfile('usr_1')).rejects.toThrow(
      new NotFoundException('User not found'),
    );
  });

  it('UTCID07 throws NotFoundException for a suspended account (UC-10 1.E2)', async () => {
    const { service } = makeService(
      { data: { ...userRow, status: 'suspended' } },
      [owned([])],
    );

    await expect(service.getPublicUserProfile('usr_1')).rejects.toThrow(
      new NotFoundException('User not found'),
    );
  });

  it('UTCID08 counts only visible public projects, excluding the moderation-hidden one', async () => {
    const { service, mock } = makeService({ data: userRow }, [
      owned(['p1', 'p2', 'p3']),
      { data: [], count: 0 },
    ]);

    const result = await service.getPublicUserProfile('usr_1');

    expect(result.total_public_projects).toBe(3);
    expect(mock.builders.projects.is).toHaveBeenCalledWith(
      'moderation_hidden_at',
      null,
    );
  });
});

// ============================================================================
// SHEET: BE-EXP-04 (ExploreService.getUserPublicProjects)
//
// Mock order per call:
//   1. projects main query (await directly, ordered created_at desc)
//   2. (items > 0) project_tags + projects fork-counts enrichment
// Per-table queues keep the order deterministic.
// ============================================================================
describe('BE-EXP-04 ExploreService.getUserPublicProjects(id)', () => {
  const row = (id: string, ownerId: string, createdAt: string) => ({
    id,
    name: `Project ${id}`,
    description: null,
    genre: null,
    visibility: 'public' as const,
    archived_at: null,
    created_at: createdAt,
    updated_at: createdAt,
    play_count: 0,
    owner: {
      id: ownerId,
      username: 'owner',
      display_name: null,
      avatar_url: null,
    },
  });

  const makeService = (
    main: QueryResult,
    extra: { fork?: QueryResult; tags?: QueryResult } = {},
  ) => {
    const tables: Record<string, QueryResult[]> = {
      projects: [main, ...(extra.fork ? [extra.fork] : [])],
      project_tags: extra.tags ? [extra.tags] : [],
    };
    const mock = createSupabaseMock([], { tables });
    return { service: new ExploreService(mock.client), mock };
  };

  it('UTCID01 returns the 2 enriched cards, newest first', async () => {
    const { service, mock } = makeService(
      {
        data: [
          row('p2', 'usr_1', '2026-02-01T00:00:00Z'),
          row('p1', 'usr_1', '2026-01-01T00:00:00Z'),
        ],
      },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await service.getUserPublicProjects('usr_1');

    expect(mock.builders.projects.order).toHaveBeenCalledWith('created_at', {
      ascending: false,
    });
    expect(result.map((c) => c.id)).toEqual(['p2', 'p1']);
  });

  it('UTCID02 returns [] when the user has no visible public projects', async () => {
    const { service } = makeService({ data: [] });

    const result = await service.getUserPublicProjects('usr_1');

    expect(result).toEqual([]);
  });

  it('UTCID03 returns [] for a non-existent user id', async () => {
    const { service } = makeService({ data: [] });

    const result = await service.getUserPublicProjects('nope');

    expect(result).toEqual([]);
  });

  it('UTCID04 throws InternalServerErrorException when the query errors', async () => {
    const { service } = makeService({
      data: null,
      error: { message: 'db error' },
    });

    await expect(service.getUserPublicProjects('usr_1')).rejects.toThrow(
      new InternalServerErrorException('Could not list user projects'),
    );
  });

  it('UTCID05 returns [] for a suspended owner with 2 public projects (BR-109)', async () => {
    const { service, mock } = makeService({ data: [] });

    const result = await service.getUserPublicProjects('usr_suspended');

    expect(result).toEqual([]);
    expect(mock.builders.projects.eq).toHaveBeenCalledWith(
      'owner.status',
      'active',
    );
  });
});

// ============================================================================
// SHEET: BE-EXP-05 (ExploreService.getRankings)
//
// Rankings read the `project_engagement` view for the order, then load the
// cards of those ids and return them in the view's order.
// ============================================================================
describe('BE-EXP-05 ExploreService.getRankings(type)', () => {
  const rankRow = (id: string, index: number) => ({
    id,
    name: `Project ${id}`,
    description: null,
    genre: null,
    visibility: 'public' as const,
    archived_at: null,
    created_at: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    updated_at: '2026-01-01T00:00:00Z',
    play_count: 0,
    owner: {
      id: 'usr_active',
      username: 'owner',
      display_name: null,
      avatar_url: null,
    },
  });

  const projectIds = Array.from({ length: 10 }, (_, i) => `p${i + 1}`);

  const makeService = (
    ranked: QueryResult,
    cards: QueryResult = { data: [] },
  ) => {
    const mock = createSupabaseMock([], {
      tables: {
        project_engagement: [ranked],
        projects: [cards, { data: [] }],
        project_tags: [{ data: [] }],
      },
    });
    return { service: new ExploreService(mock.client), mock };
  };

  const viewOf = (ids: string[]): QueryResult => ({
    data: ids.map((project_id) => ({ project_id })),
  });

  const cardsOf = (ids: string[]): QueryResult => ({
    data: [...ids].reverse().map((id, i) => rankRow(id, i)),
  });

  it('UTCID01 ranks trending by the damped recent score and keeps the view order', async () => {
    const order = ['p6', 'p7', 'p1', 'p2'];
    const { service, mock } = makeService(viewOf(order), cardsOf(order));

    const result = await service.getRankings('trending');

    expect(mock.builders.project_engagement.order).toHaveBeenCalledWith(
      'trending_score',
      { ascending: false },
    );
    expect(result.map((c) => c.id)).toEqual(order);
  });

  it('UTCID02 ranks top_played by distinct players', async () => {
    const { service, mock } = makeService(
      viewOf(projectIds),
      cardsOf(projectIds),
    );

    const result = await service.getRankings('top_played');

    expect(mock.builders.project_engagement.order).toHaveBeenCalledWith(
      'plays',
      { ascending: false },
    );
    expect(result.map((c) => c.id)).toEqual(projectIds);
  });

  it('UTCID03 defaults to trending when the type is undefined', async () => {
    const { service, mock } = makeService(viewOf(['p1']), cardsOf(['p1']));

    await service.getRankings();

    expect(mock.builders.project_engagement.order).toHaveBeenCalledWith(
      'trending_score',
      { ascending: false },
    );
  });

  it('UTCID04 ranks top_forked by distinct fork owners and returns at most 10', async () => {
    const { service, mock } = makeService(
      viewOf(projectIds),
      cardsOf(projectIds),
    );

    const result = await service.getRankings('top_forked');

    expect(mock.builders.project_engagement.order).toHaveBeenCalledWith(
      'forks',
      { ascending: false },
    );
    expect(mock.builders.project_engagement.range).toHaveBeenCalledWith(0, 9);
    expect(result).toHaveLength(10);
  });

  it('UTCID05 returns [] for top_forked when no projects are visible', async () => {
    const { service, mock } = makeService({ data: [] });

    const result = await service.getRankings('top_forked');

    expect(result).toEqual([]);
    expect(mock.builders.projects.in).not.toHaveBeenCalled();
  });

  it('UTCID06 returns [] for trending when no projects are visible', async () => {
    const { service } = makeService({ data: [] });

    const result = await service.getRankings('trending');

    expect(result).toEqual([]);
  });

  it('UTCID07 throws InternalServerErrorException for trending when the query errors', async () => {
    const { service } = makeService({
      data: null,
      error: { message: 'db error' },
    });

    await expect(service.getRankings('trending')).rejects.toThrow(
      new InternalServerErrorException('Could not get rankings'),
    );
  });

  it('UTCID08 throws InternalServerErrorException for top_forked when the query errors', async () => {
    const { service } = makeService({
      data: null,
      error: { message: 'db error' },
    });

    await expect(service.getRankings('top_forked')).rejects.toThrow(
      new InternalServerErrorException('Could not get rankings'),
    );
  });

  it('UTCID09 ranks only visible projects and loads cards of active owners (BR-109)', async () => {
    const { service, mock } = makeService(viewOf(['p1']), cardsOf(['p1']));

    await service.getRankings('trending');

    expect(mock.builders.project_engagement.eq).toHaveBeenCalledWith(
      'is_visible',
      true,
    );
    expect(mock.builders.projects.eq).toHaveBeenCalledWith(
      'owner.status',
      'active',
    );
  });
});

// ============================================================================
// SHEET: BE-EXP-06 (ExploreService.getFeatured)
//
// Mock order per call:
//   Promise.all #1: projects [featured, trending, totalProjects, totalForks]
//                   + users [totalUsers]
//   Promise.all #2: (per non-empty list) project_tags + projects fork query
// Per-table queues keep the order deterministic.
// ============================================================================
describe('BE-EXP-06 ExploreService.getFeatured()', () => {
  const featRow = (
    id: string,
    ownerId: string,
    plays: number,
    index: number,
  ) => ({
    id,
    name: `Project ${id}`,
    description: null,
    genre: null,
    visibility: 'public',
    archived_at: null,
    created_at: `2026-01-${String(index + 1).padStart(2, '0')}T00:00:00Z`,
    updated_at: '2026-01-01T00:00:00Z',
    play_count: plays,
    owner: {
      id: ownerId,
      username: 'owner',
      display_name: null,
      avatar_url: null,
    },
  });

  const rows = (ids: string[], ownerId = 'usr_active') =>
    ids.map((id, i) => featRow(id, ownerId, i + 1, i));

  const listResult = (
    idList: string[],
    ownerId = 'usr_active',
  ): QueryResult => ({ data: rows(idList, ownerId) });

  const makeService = (
    projects: QueryResult[],
    users: QueryResult[],
    tags: QueryResult[],
    fork?: QueryResult[],
  ) => {
    const projectsQueue = [
      ...projects,
      ...(fork && fork.length > 0 ? fork : []),
    ];
    const tables: Record<string, QueryResult[]> = {
      projects: projectsQueue,
      users,
      project_tags: tags,
    };
    const mock = createSupabaseMock([], { tables });
    return { service: new ExploreService(mock.client), mock };
  };

  it('UTCID01 returns the hero, 6 featured, 6 trending and the platform stats', async () => {
    const newest6 = ['p6', 'p5', 'p4', 'p3', 'p2', 'p1'];
    const played6 = ['p3', 'p1', 'p5', 'p2', 'p4', 'p6'];
    const { service } = makeService(
      [
        listResult(newest6),
        listResult(played6),
        { data: null, count: 8 },
        { data: null, count: 4 },
      ],
      [{ data: null, count: 20 }],
      [{ data: [] }, { data: [] }],
      [{ data: [] }, { data: [] }],
    );

    const result = await service.getFeatured();

    expect(result.hero.title).toBe('Sáng tác nhạc theo phong cách của bạn');
    expect(result.featured_projects.map((c) => c.id)).toEqual(newest6);
    expect(result.trending_projects.map((c) => c.id)).toEqual(played6);
    expect(result.stats).toEqual({
      total_projects: 8,
      total_users: 20,
      total_forks: 4,
    });
  });

  it('UTCID02 returns 3 featured and 3 trending items when only 3 projects are public', async () => {
    const { service } = makeService(
      [
        listResult(['p1', 'p2', 'p3']),
        listResult(['p2', 'p1', 'p3']),
        { data: null, count: 3 },
        { data: null, count: 0 },
      ],
      [{ data: null, count: 5 }],
      [{ data: [] }, { data: [] }],
      [{ data: [] }, { data: [] }],
    );

    const result = await service.getFeatured();

    expect(result.featured_projects).toHaveLength(3);
    expect(result.trending_projects.map((c) => c.id)).toEqual([
      'p2',
      'p1',
      'p3',
    ]);
    expect(result.stats).toEqual({
      total_projects: 3,
      total_users: 5,
      total_forks: 0,
    });
  });

  it('UTCID03 returns the hero, empty lists and zero stats when nothing is public', async () => {
    const { service } = makeService(
      [
        { data: [] },
        { data: [] },
        { data: null, count: 0 },
        { data: null, count: 0 },
      ],
      [{ data: null, count: 0 }],
      [],
    );

    const result = await service.getFeatured();

    expect(result.hero.title).toBe('Sáng tác nhạc theo phong cách của bạn');
    expect(result.featured_projects).toEqual([]);
    expect(result.trending_projects).toEqual([]);
    expect(result.stats).toEqual({
      total_projects: 0,
      total_users: 0,
      total_forks: 0,
    });
  });

  it('UTCID04 keeps the stats when the project list queries error', async () => {
    const { service } = makeService(
      [
        { data: null, error: { message: 'db error' } },
        { data: null, error: { message: 'db error' } },
        { data: null, count: 6 },
        { data: null, count: 2 },
      ],
      [{ data: null, count: 4 }],
      [],
    );

    const result = await service.getFeatured();

    expect(result.featured_projects).toEqual([]);
    expect(result.trending_projects).toEqual([]);
    expect(result.stats).toEqual({
      total_projects: 6,
      total_users: 4,
      total_forks: 2,
    });
  });

  it('UTCID05 falls back to empty lists and zero stats when every query errors', async () => {
    const { service } = makeService(
      [
        { data: null, error: { message: 'db error' } },
        { data: null, error: { message: 'db error' } },
        { data: null, error: { message: 'db error' }, count: null },
        { data: null, error: { message: 'db error' }, count: null },
      ],
      [{ data: null, error: { message: 'db error' }, count: null }],
      [],
    );

    const result = await service.getFeatured();

    expect(result.hero.title).toBe('Sáng tác nhạc theo phong cách của bạn');
    expect(result.featured_projects).toEqual([]);
    expect(result.trending_projects).toEqual([]);
    expect(result.stats).toEqual({
      total_projects: 0,
      total_users: 0,
      total_forks: 0,
    });
  });
});

// ============================================================================
// SHEET: BE-EXP-07 (ExploreService.getForkCounts)
//
// Single query per call:
//   projects .in('forked_from_project_id', ids) - awaited directly
// An empty id list issues no query at all.
// ============================================================================
describe('BE-EXP-07 ExploreService.getForkCounts(projectIds)', () => {
  const forkRows = (parents: string[]) =>
    parents.map((id) => ({ forked_from_project_id: id }));

  const makeService = (main?: QueryResult) => {
    const mock = createSupabaseMock([], {
      tables: { projects: main ? [main] : [] },
    });
    const service = new ExploreService(mock.client);
    const counts = (
      service as unknown as {
        getForkCounts(ids: string[]): Promise<Map<string, number>>;
      }
    ).getForkCounts.bind(service) as (
      ids: string[],
    ) => Promise<Map<string, number>>;
    return { counts, mock };
  };

  it('UTCID01 returns an empty Map and sends no query for an empty id list', async () => {
    const { counts, mock } = makeService();

    const result = await counts([]);

    expect(result).toEqual(new Map<string, number>());
    expect(mock.builders.projects.in).not.toHaveBeenCalled();
  });

  it('UTCID02 counts forks per parent (2 of P1, 1 of P2)', async () => {
    const { counts, mock } = makeService({
      data: forkRows(['P1', 'P1', 'P2']),
    });

    const result = await counts(['P1', 'P2', 'P3']);

    expect(mock.builders.projects.in).toHaveBeenCalledWith(
      'forked_from_project_id',
      ['P1', 'P2', 'P3'],
    );
    expect(result).toEqual(
      new Map([
        ['P1', 2],
        ['P2', 1],
      ]),
    );
    expect(result.has('P3')).toBe(false);
  });

  it('UTCID03 returns an empty Map when no forks are found', async () => {
    const { counts } = makeService({ data: [] });

    const result = await counts(['P1', 'P2', 'P3']);

    expect(result).toEqual(new Map<string, number>());
  });

  it('UTCID04 returns an empty Map when Supabase returns an error', async () => {
    const { counts } = makeService({
      data: null,
      error: { message: 'db error' },
    });

    const result = await counts(['P1', 'P2', 'P3']);

    expect(result).toEqual(new Map<string, number>());
  });
});

// ============================================================================
// SHEET: BE-EXP-08 (ExploreService.enrichProjectCards)
//
// Mock order per call:
//   Promise.all: project_tags .in('project_id', ids)
//                + (no precomputed map) projects fork .in('forked_from_project_id', ids)
// An empty input short-circuits before any query.
// ============================================================================
describe('BE-EXP-08 ExploreService.enrichProjectCards(projects, precomputedForkCounts)', () => {
  const enrichRow = (
    id: string,
    owner: unknown,
    created = '2026-01-01T00:00:00Z',
  ) => ({
    id,
    name: `Project ${id}`,
    description: null,
    genre: null,
    visibility: 'public',
    archived_at: null,
    created_at: created,
    updated_at: created,
    play_count: 0,
    owner,
  });

  const owner = {
    id: 'usr_1',
    username: 'owner',
    display_name: null,
    avatar_url: null,
  };

  const twoRows = (ownerValue: unknown = owner) => [
    enrichRow('P1', ownerValue, '2026-01-02T00:00:00Z'),
    enrichRow('P2', ownerValue, '2026-01-01T00:00:00Z'),
  ];

  const makeService = (
    tags?: QueryResult,
    fork?: QueryResult,
    precomputed?: Map<string, number>,
  ) => {
    const tables: Record<string, QueryResult[]> = {
      project_tags: tags ? [tags] : [],
      projects: fork ? [fork] : [],
    };
    const mock = createSupabaseMock([], { tables });
    const service = new ExploreService(mock.client);
    const enrich = (
      service as unknown as {
        enrichProjectCards(
          projects: unknown[],
          precomputedForkCounts?: Map<string, number>,
        ): Promise<PublicProjectCard[]>;
      }
    ).enrichProjectCards.bind(service) as (
      projects: unknown[],
      precomputedForkCounts?: Map<string, number>,
    ) => Promise<PublicProjectCard[]>;
    return { enrich, mock, service, precomputed };
  };

  it('UTCID01 returns [] without sending any query for an empty input', async () => {
    const { enrich, mock } = makeService();

    const result = await enrich([]);

    expect(result).toEqual([]);
    expect(mock.builders.project_tags.in).not.toHaveBeenCalled();
    expect(mock.builders.projects.in).not.toHaveBeenCalled();
  });

  it('UTCID02 collects array-form tag names and fork counts into the cards', async () => {
    const { enrich } = makeService(
      {
        data: [
          {
            project_id: 'P1',
            tag: [{ name: 'rock' }, { name: 'lofi' }],
          },
        ],
      },
      {
        data: [
          { forked_from_project_id: 'P1' },
          { forked_from_project_id: 'P2' },
        ],
      },
    );

    const result = await enrich(twoRows());

    expect(result.map((c) => c.id)).toEqual(['P1', 'P2']);
    expect(result[0].tags).toEqual(['rock', 'lofi']);
    expect(result[1].tags).toEqual([]);
    expect(result[0].fork_count).toBe(1);
    expect(result[1].fork_count).toBe(1);
    expect(result[0].owner).toEqual(owner);
  });

  it('UTCID03 reuses the precomputed fork map instead of querying forks', async () => {
    const { enrich, mock, precomputed } = makeService(
      {
        data: [{ project_id: 'P1', tag: [{ name: 'rock' }, { name: 'lofi' }] }],
      },
      undefined,
      new Map([['P1', 7]]),
    );

    const result = await enrich(twoRows(), precomputed);

    expect(mock.builders.projects.in).not.toHaveBeenCalled();
    expect(result[0].tags).toEqual(['rock', 'lofi']);
    expect(result[0].fork_count).toBe(7);
    expect(result[1].fork_count).toBe(0);
  });

  it('UTCID04 collects object-form tag names into the cards', async () => {
    const { enrich } = makeService(
      { data: [{ project_id: 'P1', tag: { name: 'rock' } }] },
      { data: [] },
    );

    const result = await enrich(twoRows());

    expect(result[0].tags).toEqual(['rock']);
    expect(result[1].tags).toEqual([]);
  });

  it('UTCID05 defaults a null owner to an empty id and null fields', async () => {
    const { enrich } = makeService({ data: [] }, { data: [] });

    const result = await enrich([enrichRow('P1', null)]);

    expect(result[0].owner).toEqual({
      id: '',
      username: null,
      display_name: null,
      avatar_url: null,
    });
    expect(result[0].tags).toEqual([]);
  });

  it('UTCID06 returns cards with empty tag lists when no tags exist', async () => {
    const { enrich } = makeService({ data: [] }, { data: [] });

    const result = await enrich(twoRows());

    expect(result).toHaveLength(2);
    expect(result[0].tags).toEqual([]);
    expect(result[1].tags).toEqual([]);
  });

  it('UTCID07 returns cards with empty tags when the tag query errors', async () => {
    const { enrich } = makeService(
      { data: null, error: { message: 'db error' } },
      { data: [] },
    );

    const result = await enrich(twoRows());

    expect(result[0].tags).toEqual([]);
    expect(result[1].tags).toEqual([]);
  });

  it('UTCID08 skips empty tag names', async () => {
    const { enrich } = makeService(
      { data: [{ project_id: 'P1', tag: [{ name: '' }] }] },
      { data: [] },
    );

    const result = await enrich(twoRows());

    expect(result[0].tags).toEqual([]);
  });

  it('UTCID09 throws a TypeError when a tag join row returns a null tag', async () => {
    const { enrich } = makeService(
      { data: [{ project_id: 'P1', tag: null }] },
      { data: [] },
    );

    await expect(enrich(twoRows())).rejects.toThrow(
      "Cannot read properties of null (reading 'name')",
    );
  });
});
