import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

process.env.NEXT_PUBLIC_API_URL = 'http://api.test';

import {
  ApiError,
  listPublicProjects,
  mergeBranches,
  getCommitHistory,
  resolveProjectCustomSounds,
} from './api-client';
import { supabase } from './supabase-browser';

vi.mock('./supabase-browser', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(),
    },
  },
}));

describe('FE-LIB api-client', () => {
  beforeEach(() => {
    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: { session: null },
    } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('FE-LIB-02 api-client.listPublicProjects(params?)', () => {
    it('UTCID01 sends GET /explore/projects without query when params is undefined', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ projects: [], total: 0 }),
      } as Response);

      const res = await listPublicProjects();

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.test/explore/projects',
        expect.anything(),
      );
      expect(res).toEqual({ projects: [], total: 0 });
    });

    it('UTCID02 sends GET with all 6 query parameters set', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ projects: [], total: 0 }),
      } as Response);

      await listPublicProjects({
        page: 1,
        limit: 10,
        genre: 'Pop',
        tag: 'chill',
        sort: 'popular',
        search: 'piano',
      });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.pathname).toBe('/explore/projects');
      expect(url.searchParams.get('page')).toBe('1');
      expect(url.searchParams.get('limit')).toBe('10');
      expect(url.searchParams.get('genre')).toBe('Pop');
      expect(url.searchParams.get('tag')).toBe('chill');
      expect(url.searchParams.get('sort')).toBe('popular');
      expect(url.searchParams.get('search')).toBe('piano');
    });

    it('UTCID03 sends GET with only sort=popular parameter', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ projects: [] }),
      } as Response);

      await listPublicProjects({ sort: 'popular' });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.test/explore/projects?sort=popular',
        expect.anything(),
      );
    });

    it('UTCID04 omits page and limit when values are 0', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ projects: [] }),
      } as Response);

      await listPublicProjects({ page: 0, limit: 0 });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.test/explore/projects',
        expect.anything(),
      );
    });

    it('UTCID05 omits search query when search string is empty', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ projects: [] }),
      } as Response);

      await listPublicProjects({ search: '' });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.test/explore/projects',
        expect.anything(),
      );
    });

    it('UTCID06 encodes spaces in search and includes page parameter', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ projects: [] }),
      } as Response);

      await listPublicProjects({ search: 'lo fi', page: 2 });

      const calledUrl = fetchSpy.mock.calls[0][0] as string;
      const url = new URL(calledUrl);
      expect(url.searchParams.get('page')).toBe('2');
      expect(url.searchParams.get('search')).toBe('lo fi');
    });

    it('UTCID07 propagates ApiError when server returns 500 error', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ message: 'Internal server error' }),
      } as Response);

      await expect(listPublicProjects()).rejects.toThrow(ApiError);
    });
  });

  describe('FE-LIB-03 api-client.mergeBranches(payload)', () => {
    const payload = {
      sourceBranchId: 'branch-1',
      targetBranchId: 'branch-2',
    };

    it('UTCID01 returns MergeSuccessResult on HTTP 200', async () => {
      const successData = {
        hasConflicts: false,
        commit: { id: 'commit-123' },
      };
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => successData,
      } as Response);

      const res = await mergeBranches(payload);
      expect(res).toEqual(successData);
    });

    it('UTCID02 unwraps MergeConflictResult on HTTP 409 with hasConflicts true', async () => {
      const conflictBody = {
        hasConflicts: true,
        conflictsCount: 1,
        conflictsByBar: {},
      };
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => conflictBody,
      } as Response);

      const res = await mergeBranches(payload);
      expect(res).toEqual(conflictBody);
    });

    it('UTCID03 rethrows ApiError 409 when body lacks hasConflicts', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ message: 'Target branch has moved on' }),
      } as Response);

      await expect(mergeBranches(payload)).rejects.toMatchObject({
        status: 409,
        message: 'Target branch has moved on',
      });
    });

    it('UTCID04 rethrows ApiError 409 when body is undefined or empty', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({}),
      } as Response);

      await expect(mergeBranches(payload)).rejects.toMatchObject({
        status: 409,
      });
    });

    it('UTCID05 rethrows ApiError 404 on branch not found', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Source branch not found' }),
      } as Response);

      await expect(mergeBranches(payload)).rejects.toMatchObject({
        status: 404,
        message: 'Source branch not found',
      });
    });

    it('UTCID06 rethrows TypeError on network failure', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(mergeBranches(payload)).rejects.toThrow(TypeError);
    });
  });

  describe('FE-LIB-04 api-client.getCommitHistory(params)', () => {
    it('UTCID01 sends GET /commits?branch_id=b1 when page and limit are omitted', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ commits: [], total: 0 }),
      } as Response);

      await getCommitHistory({ branchId: 'b1' });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.test/commits?branch_id=b1',
        expect.anything(),
      );
    });

    it('UTCID02 sends GET with branch_id, page and limit query parameters', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ commits: [], total: 0 }),
      } as Response);

      await getCommitHistory({ branchId: 'b1', page: 2, limit: 20 });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.test/commits?branch_id=b1&page=2&limit=20',
        expect.anything(),
      );
    });

    it('UTCID03 omits page and limit when their values are 0', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ commits: [] }),
      } as Response);

      await getCommitHistory({ branchId: 'b1', page: 0, limit: 0 });

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.test/commits?branch_id=b1',
        expect.anything(),
      );
    });

    it('UTCID04 propagates ApiError 404 when branch is not found', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Branch not found' }),
      } as Response);

      await expect(getCommitHistory({ branchId: 'x' })).rejects.toMatchObject({
        status: 404,
        message: 'Branch not found',
      });
    });
  });

  describe('FE-LIB-05 api-client.resolveProjectCustomSounds(projectId, ids)', () => {
    it('UTCID01 returns empty array without calling fetch when ids is empty', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      const res = await resolveProjectCustomSounds('project-1', []);

      expect(res).toEqual([]);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('UTCID02 sends GET request with single sound id', async () => {
      const sounds = [{ id: 's1', name: 'Kick', playable: true, playbackUrl: 'http://cdn/s1.wav', reason: null }];
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => sounds,
      } as Response);

      const res = await resolveProjectCustomSounds('project-1', ['s1']);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.test/projects/project-1/custom-sounds?ids=s1',
        expect.anything(),
      );
      expect(res).toEqual(sounds);
    });

    it('UTCID03 encodes special characters in sound ids', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      } as Response);

      await resolveProjectCustomSounds('project-1', ['a b', 'c/d']);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://api.test/projects/project-1/custom-sounds?ids=a%20b,c%2Fd',
        expect.anything(),
      );
    });

    it('UTCID04 propagates ApiError 403 on permission denied', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'You do not have access to this project' }),
      } as Response);

      await expect(
        resolveProjectCustomSounds('project-1', ['s1']),
      ).rejects.toMatchObject({
        status: 403,
        message: 'You do not have access to this project',
      });
    });
  });
});
