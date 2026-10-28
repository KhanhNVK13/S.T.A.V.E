import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type SupabaseMockOptions,
} from '../test-utils/supabase-mock';
import { ExploreService } from './explore.service';

const projectId = '33333333-3333-4333-8333-333333333333';
const userId = '44444444-4444-4444-8444-444444444444';

function makeService(
  rpc: SupabaseMockOptions['rpc'],
  tables: SupabaseMockOptions['tables'] = {},
) {
  const mock = createSupabaseMock([], { rpc, tables });
  return { service: new ExploreService(mock.client), ...mock };
}

describe('ExploreService.recordPlay', () => {
  it('returns the play count from the database function', async () => {
    const { service, rpc } = makeService({
      record_project_play: { data: 5 },
    });
    await expect(service.recordPlay(projectId, userId)).resolves.toEqual({
      play_count: 5,
    });
    expect(rpc).toHaveBeenCalledWith('record_project_play', {
      p_project_id: projectId,
      p_user_id: userId,
    });
  });

  it('answers not found when the project is not publicly visible', async () => {
    const { service } = makeService({ record_project_play: { data: null } });
    await expect(service.recordPlay(projectId, userId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('reports a database failure', async () => {
    const { service } = makeService({
      record_project_play: { data: null, error: { message: 'x' } },
    });
    await expect(service.recordPlay(projectId, userId)).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});

describe('ExploreService engagement ranking', () => {
  const idA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const idB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  function cardRow(id: string) {
    return {
      id,
      name: `Project ${id.slice(0, 4)}`,
      description: null,
      genre: null,
      visibility: 'public',
      archived_at: null,
      created_at: '2026-10-01T00:00:00.000Z',
      updated_at: '2026-10-01T00:00:00.000Z',
      play_count: 0,
      owner: { id: userId, username: 'u', display_name: 'U', avatar_url: null },
    };
  }

  function makeRankingService(
    engagement: { data?: unknown; error?: unknown; count?: number },
    cards: unknown[] = [],
  ) {
    const mock = createSupabaseMock([], {
      tables: {
        project_engagement: [engagement],
        projects: [{ data: cards }, { data: [] }],
        project_tags: [{ data: [] }],
      },
    });
    return { service: new ExploreService(mock.client), ...mock };
  }

  it('orders fork rankings by the view and keeps that order for the cards', async () => {
    const { service, builders } = makeRankingService(
      { data: [{ project_id: idB }, { project_id: idA }] },
      [cardRow(idA), cardRow(idB)],
    );

    const result = await service.getRankings('top_forked');

    expect(result.map((card) => card.id)).toEqual([idB, idA]);
    expect(builders.project_engagement.order).toHaveBeenCalledWith('forks', {
      ascending: false,
    });
    expect(builders.project_engagement.eq).toHaveBeenCalledWith(
      'is_visible',
      true,
    );
  });

  it('uses the damped recent score for trending', async () => {
    const { service, builders } = makeRankingService({ data: [] });

    await expect(service.getRankings('trending')).resolves.toEqual([]);
    expect(builders.project_engagement.order).toHaveBeenCalledWith(
      'trending_score',
      { ascending: false },
    );
  });

  it('sorts the explore list by lifetime engagement and reports the total', async () => {
    const { service, builders } = makeRankingService(
      { data: [{ project_id: idA }], count: 7 },
      [cardRow(idA)],
    );

    const result = await service.listPublicProjects({
      sort: 'most_played',
      page: 1,
      limit: 5,
    } as never);

    expect(result.total).toBe(7);
    expect(result.totalPages).toBe(2);
    expect(builders.project_engagement.order).toHaveBeenCalledWith(
      'score_all',
      { ascending: false },
    );
  });

  it('fails with a server error when the view cannot be read', async () => {
    const { service } = makeRankingService({ error: { message: 'down' } });

    await expect(service.getRankings('top_played')).rejects.toThrow(
      new InternalServerErrorException('Could not get rankings'),
    );
  });
});
