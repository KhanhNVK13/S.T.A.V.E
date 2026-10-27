import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ExploreService } from './explore.service';
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

  it('UTCID01 returns 20 per page and totalPages 2 by SRS defaults, ordered created_at desc', async () => {
    const { service, mock } = makeService(
      { data: rows25(), count: 25 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, { sort: 'newest' });

    expect(result.total).toBe(25);
    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(2);
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

  it('UTCID04 orders by play_count desc for sort "popular"', async () => {
    const { service, mock } = makeService(
      { data: rows25(), count: 25 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, { sort: 'popular' });

    expect(mock.builders.projects.order).toHaveBeenCalledWith('play_count', {
      ascending: false,
    });
    expect(result.items).toHaveLength(25);
  });

  it('UTCID05 orders by play_count desc for sort "most_played"', async () => {
    const { service, mock } = makeService(
      { data: rows25(), count: 25 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, { sort: 'most_played' });

    expect(mock.builders.projects.order).toHaveBeenCalledWith('play_count', {
      ascending: false,
    });
    expect(result.items).toHaveLength(25);
  });

  it('UTCID06 falls back to 20 per page, created_at desc, totalPages 2 when sort is undefined', async () => {
    const { service, mock } = makeService(
      { data: rows25(), count: 25 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, {});

    expect(result.limit).toBe(20);
    expect(result.totalPages).toBe(2);
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

  it('UTCID12 excludes projects owned by suspended accounts (BR-109)', async () => {
    const { service } = makeService(
      {
        data: [card('pa', 'usr_active'), card('pb', 'usr_suspended')],
        count: 2,
      },
      { fork: { data: [] }, tags: { data: [] } },
    );

    const result = await call(service, { sort: 'newest' });

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
    expect(mock.rpc).toHaveBeenCalledWith('increment_project_play_count', {
      p_project_id: 'proj_1',
    });
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
    const { service } = makeService(
      { data: row('usr_suspended') },
      { data: 43 },
      { fork: { data: [] }, tags: { data: [] } },
    );

    await expect(service.getPublicProject('proj_1')).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });
});
