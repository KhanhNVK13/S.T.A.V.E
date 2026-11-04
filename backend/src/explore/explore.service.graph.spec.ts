import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  createSupabaseMock,
  type QueryResult,
} from '../test-utils/supabase-mock';
import { ExploreService } from './explore.service';

const branch = {
  id: 'b1',
  name: 'main',
  is_default: true,
  head_commit_id: 'c2',
};
const commit = (id: string, n: number, authorId: string | null = 'u1') => ({
  id,
  branch_id: 'b1',
  author_id: authorId,
  message: `msg ${id}`,
  created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(),
  parent_commit_id: null,
  merged_from_commit_id: null,
  snapshot: { secret: true },
  is_active: true,
});
const user = {
  id: 'u1',
  username: 'ann',
  display_name: 'Ann',
  avatar_url: null,
  email: 'x@y.z',
};

function make(tables: Record<string, QueryResult[]>) {
  const mock = createSupabaseMock([], { tables });
  return { service: new ExploreService(mock.client), mock };
}
const okProject = { data: { id: 'p1' } };

describe('ExploreService.getPublicProjectGraph', () => {
  it('returns branches and commits (oldest first) with only public fields', async () => {
    const { service } = make({
      projects: [okProject],
      branches: [{ data: [branch] }],
      commits: [{ data: [commit('c2', 2), commit('c1', 1)], count: 2 }],
      users: [{ data: [user] }],
    });
    const res = await service.getPublicProjectGraph('p1');
    expect(res.total).toBe(2);
    expect(res.branches).toEqual([
      { id: 'b1', name: 'main', is_default: true, head_commit_id: 'c2' },
    ]);
    expect(res.commits.map((c) => c.id)).toEqual(['c1', 'c2']);
    expect(Object.keys(res.commits[0]).sort()).toEqual(
      [
        'author',
        'branch_id',
        'created_at',
        'id',
        'merged_from_commit_id',
        'message',
        'parent_commit_id',
      ].sort(),
    );
    expect(res.commits[0].author).toEqual({
      id: 'u1',
      username: 'ann',
      display_name: 'Ann',
      avatar_url: null,
    });
    const json = JSON.stringify(res);
    for (const f of [
      'snapshot',
      'is_active',
      'created_by',
      'base_commit_id',
      'email',
      'author_id',
    ]) {
      expect(json).not.toContain(f);
    }
  });

  it.each([
    ['private', { data: null }],
    ['moderation-hidden', { data: null }],
    ['nonexistent', { data: null }],
    ['query error', { data: null, error: { message: 'x' } }],
  ])('answers the same 404 for %s project', async (_n, result) => {
    const { service } = make({ projects: [result] });
    await expect(service.getPublicProjectGraph('p1')).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('needs no user context (guest can read a public project)', async () => {
    const { service } = make({
      projects: [okProject],
      branches: [{ data: [branch] }],
      commits: [{ data: [], count: 0 }],
    });
    await expect(service.getPublicProjectGraph('p1')).resolves.toEqual({
      branches: [branch],
      commits: [],
      total: 0,
    });
  });

  it('is null-safe for deleted authors', async () => {
    const { service } = make({
      projects: [okProject],
      branches: [{ data: [branch] }],
      commits: [{ data: [commit('c1', 1, 'gone')], count: 1 }],
      users: [{ data: [] }],
    });
    const res = await service.getPublicProjectGraph('p1');
    expect(res.commits[0].author).toEqual({
      id: 'gone',
      username: null,
      display_name: null,
      avatar_url: null,
    });
  });

  it('returns the newest 1000 commits and the full total', async () => {
    const newest = Array.from({ length: 1000 }, (_v, i) =>
      commit(`c${String(2500 - i).padStart(4, '0')}`, 2500 - i),
    );
    const { service, mock } = make({
      projects: [okProject],
      branches: [{ data: [branch] }],
      commits: [{ data: newest, count: 2500 }],
      users: [{ data: [user] }],
    });
    const res = await service.getPublicProjectGraph('p1');
    expect(res.commits).toHaveLength(1000);
    expect(res.total).toBe(2500);
    expect(res.commits[0].id).toBe('c1501');
    expect(res.commits[999].id).toBe('c2500');
    expect(mock.builders.commits.range).toHaveBeenCalledWith(0, 999);
  });

  it('reports a database failure', async () => {
    const { service } = make({
      projects: [okProject],
      branches: [{ data: [branch] }],
      commits: [{ data: null, error: { message: 'x' } }],
    });
    await expect(service.getPublicProjectGraph('p1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
