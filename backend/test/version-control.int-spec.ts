import type { INestApplication } from '@nestjs/common';
import { asUser, createProject } from './support/test-api';
import { createTestApp } from './support/test-app';
import {
  commitDraft,
  defaultBranchId,
  note,
  putDraft,
  snapshot,
  track,
} from './support/test-music';
import {
  cleanupTestUsers,
  createTestUser,
  type TestUser,
} from './support/test-users';

interface HistoryBody {
  items: Array<{ id: string; message: string }>;
  total: number;
}

describe('Version Control API (integration)', () => {
  let app: INestApplication;
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    userA = await createTestUser(app);
    userB = await createTestUser(app);
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await app.close();
  });

  async function newProject(
    name = `Test Song ${Math.random().toString(36).slice(2, 8)}`,
  ) {
    const project = await createProject(app, userA, name);
    const branchId = await defaultBranchId(app, userA, project.id);
    return { projectId: project.id, branchId };
  }

  async function history(branchId: string, user = userA) {
    const response = await asUser(app, user)
      .get(`/commits?branch_id=${branchId}`)
      .expect(200);
    return response.body as HistoryBody;
  }

  async function tagsOf(commitId: string) {
    const response = await asUser(app, userA)
      .get(`/commits/${commitId}/tags`)
      .expect(200);
    return response.body as Array<Record<string, unknown>>;
  }

  describe('UC-42 Create commit', () => {
    it('API: creates a commit with a valid message on the active branch', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));

      const commit = await commitDraft(
        app,
        userA,
        branchId,
        'Add bass line to chorus',
      );

      const body = await history(branchId);
      expect(body.items[0]).toEqual(
        expect.objectContaining({
          id: commit.id,
          message: 'Add bass line to chorus',
        }),
      );
      expect(body.total).toBe(1);
    });

    it('API: refuses a commit when the draft has no changes', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));
      await commitDraft(app, userA, branchId, 'First');

      await asUser(app, userA)
        .post('/commits')
        .send({ branch_id: branchId, message: 'Nothing changed' })
        .expect(400);

      expect((await history(branchId)).total).toBe(1);
    });

    it('API: refuses a commit from a user who is not on the project', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));

      const response = await asUser(app, userB)
        .post('/commits')
        .send({ branch_id: branchId, message: 'Intruder' });

      expect([400, 403, 404]).toContain(response.status);
      expect((await history(branchId)).total).toBe(0);
    });

    it('API: rejects an empty commit message', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));

      await asUser(app, userA)
        .post('/commits')
        .send({ branch_id: branchId, message: '' })
        .expect(400);

      expect((await history(branchId)).total).toBe(0);
    });

    it('API: rejects a commit message longer than 200 characters', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));

      await asUser(app, userA)
        .post('/commits')
        .send({ branch_id: branchId, message: 'x'.repeat(201) })
        .expect(400);

      expect((await history(branchId)).total).toBe(0);
    });

    it('API: stops a commit when the branch head moved on', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));
      const first = await commitDraft(app, userA, branchId, 'First');
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([note('n1'), note('n2', { start: 480 })]),
      );
      await commitDraft(app, userA, branchId, 'B change');
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([note('n1'), note('n3', { start: 960 })]),
      );

      await asUser(app, userA)
        .post('/commits')
        .send({
          branch_id: branchId,
          message: 'A change',
          expectedHeadCommitId: first.id,
        })
        .expect(409);

      const body = await history(branchId);
      expect(body.total).toBe(2);
      expect(body.items[0].message).toBe('B change');
    });

    it('API: accepts commit messages of 1 and 200 characters', async () => {
      const { projectId, branchId } = await newProject();
      const long = 'm'.repeat(200);
      await putDraft(app, userA, projectId, snapshot([note('n1')]));
      await commitDraft(app, userA, branchId, 'A');
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([note('n1'), note('n2', { start: 480 })]),
      );
      await commitDraft(app, userA, branchId, long);

      const body = await history(branchId);
      expect(body.items.map((item) => item.message)).toEqual([long, 'A']);
    });

    it('API: keeps a created commit unchangeable through the API', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));
      const commit = await commitDraft(app, userA, branchId, 'Immutable test');

      await asUser(app, userA)
        .patch(`/commits/${commit.id}`)
        .send({ message: 'Changed' })
        .expect(404);
      await asUser(app, userA).delete(`/commits/${commit.id}`).expect(404);

      const stored = await asUser(app, userA)
        .get(`/commits/${commit.id}`)
        .expect(200);
      expect((stored.body as { message: string }).message).toBe(
        'Immutable test',
      );
    });
  });

  describe('UC-43 View commit history', () => {
    it('API: lists the commits of the branch newest first', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));
      await commitDraft(app, userA, branchId, 'Verse idea');
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([note('n1'), note('n2', { start: 480 })]),
      );
      await commitDraft(app, userA, branchId, 'Add drums');
      await putDraft(app, userA, projectId, snapshot([note('n1')]));
      await commitDraft(app, userA, branchId, 'Change chorus');

      const body = await history(branchId);
      expect(body.items.map((item) => item.message)).toEqual([
        'Change chorus',
        'Add drums',
        'Verse idea',
      ]);
    });

    it('API: refuses the history of a project to a user who is not on it', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));
      await commitDraft(app, userA, branchId, 'Private');

      const response = await asUser(app, userB).get(
        `/commits?branch_id=${branchId}`,
      );

      expect([400, 403, 404]).toContain(response.status);
      expect(JSON.stringify(response.body)).not.toContain('Private');
    });
  });

  describe('UC-44 Tag a commit', () => {
    async function twoCommits() {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));
      const first = await commitDraft(app, userA, branchId, 'Verse idea');
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([note('n1'), note('n2', { start: 480 })]),
      );
      const second = await commitDraft(app, userA, branchId, 'Add drums');
      return { first, second };
    }

    it('API: adds a valid tag to a commit', async () => {
      const { second } = await twoCommits();

      await asUser(app, userA)
        .post(`/commits/${second.id}/tag`)
        .send({ tag: 'demo-v1' })
        .expect(201);

      expect(JSON.stringify(await tagsOf(second.id))).toContain('demo-v1');
      const stored = await asUser(app, userA)
        .get(`/commits/${second.id}`)
        .expect(200);
      expect((stored.body as { message: string }).message).toBe('Add drums');
    });

    it('API: removes the tag from a commit', async () => {
      const { second } = await twoCommits();
      await asUser(app, userA)
        .post(`/commits/${second.id}/tag`)
        .send({ tag: 'demo-v1' })
        .expect(201);

      await asUser(app, userA)
        .delete(`/commits/${second.id}/tags/demo-v1`)
        .expect(204);

      expect(await tagsOf(second.id)).toEqual([]);
    });

    it('API: rejects an empty tag name', async () => {
      const { second } = await twoCommits();

      await asUser(app, userA)
        .post(`/commits/${second.id}/tag`)
        .send({ tag: '' })
        .expect(400);

      expect(await tagsOf(second.id)).toEqual([]);
    });

    it('API: rejects a tag name longer than 30 characters', async () => {
      const { second } = await twoCommits();

      await asUser(app, userA)
        .post(`/commits/${second.id}/tag`)
        .send({ tag: 't'.repeat(31) })
        .expect(400);

      expect(await tagsOf(second.id)).toEqual([]);
    });

    it('API: rejects a tag name already used in the project', async () => {
      const { first, second } = await twoCommits();
      await asUser(app, userA)
        .post(`/commits/${first.id}/tag`)
        .send({ tag: 'final' })
        .expect(201);

      await asUser(app, userA)
        .post(`/commits/${second.id}/tag`)
        .send({ tag: 'final' })
        .expect(409);

      expect(await tagsOf(second.id)).toEqual([]);
      expect(JSON.stringify(await tagsOf(first.id))).toContain('final');
    });

    it('API: never lets a commit carry two tags', async () => {
      const { second } = await twoCommits();
      await asUser(app, userA)
        .post(`/commits/${second.id}/tag`)
        .send({ tag: 'demo-v1' })
        .expect(201);

      await asUser(app, userA)
        .post(`/commits/${second.id}/tag`)
        .send({ tag: 'demo-final' });

      const tags = await tagsOf(second.id);
      expect(tags).toHaveLength(1);
      expect(JSON.stringify(tags)).toContain('demo-final');
    });

    it('API: accepts tag names of 1 and 30 characters', async () => {
      const { first, second } = await twoCommits();
      const long = 'a'.repeat(30);

      await asUser(app, userA)
        .post(`/commits/${first.id}/tag`)
        .send({ tag: 'A' })
        .expect(201);
      await asUser(app, userA)
        .post(`/commits/${second.id}/tag`)
        .send({ tag: long })
        .expect(201);

      expect(JSON.stringify(await tagsOf(first.id))).toContain('"A"');
      expect(JSON.stringify(await tagsOf(second.id))).toContain(long);
    });
  });

  describe('UC-45 Compare versions', () => {
    async function diff(base: string, target: string) {
      const response = await asUser(app, userA)
        .get(`/commits/diff?baseCommitId=${base}&targetCommitId=${target}`)
        .expect(200);
      return response.body as {
        areIdentical: boolean;
        summary: {
          notes: { added: number; removed: number; modified: number };
          tracks: { added: number; removed: number; modified: number };
        };
        tracksDiff: { noteCounts: Record<string, number> };
        changesByBar: Record<string, { added: unknown[] }>;
      };
    }

    async function baseAndEdit() {
      const { projectId, branchId } = await newProject();
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([
          note('a'),
          note('b', { start: 480 }),
          note('c', { start: 960 }),
        ]),
      );
      const base = await commitDraft(app, userA, branchId, 'Base');
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([
          note('a', { pitch: 64 }),
          note('b', { start: 480 }),
          note('d', { start: 1440 }),
          note('e', { start: 1920 }),
        ]),
      );
      const edit = await commitDraft(app, userA, branchId, 'Edit');
      return { projectId, branchId, base, edit };
    }

    it('API: reports added, removed and modified notes between two commits', async () => {
      const { base, edit } = await baseAndEdit();

      const result = await diff(base.id, edit.id);

      expect(result.areIdentical).toBe(false);
      expect(result.summary.notes).toEqual(
        expect.objectContaining({ added: 2, removed: 1, modified: 1 }),
      );
    });

    it('API: swaps added and removed when the direction is reversed', async () => {
      const { base, edit } = await baseAndEdit();

      const result = await diff(edit.id, base.id);

      expect(result.summary.notes).toEqual(
        expect.objectContaining({ added: 1, removed: 2, modified: 1 }),
      );
    });

    it('API: reports that nothing changed for two identical versions', async () => {
      const { branchId, base } = await baseAndEdit();
      const restored = await asUser(app, userA)
        .post(`/commits/${base.id}/restore`)
        .send({ branch_id: branchId })
        .expect(201);

      const result = await diff(base.id, (restored.body as { id: string }).id);

      expect(result.areIdentical).toBe(true);
    });

    it('API: reports a track present in only one version as a whole track', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('a')]));
      const before = await commitDraft(app, userA, branchId, 'Before strings');
      const strings = Array.from({ length: 8 }, (_, index) =>
        note(`s${index}`, { trackId: 'track-3', start: index * 480 }),
      );
      await putDraft(
        app,
        userA,
        projectId,
        snapshot(
          [note('a'), ...strings],
          [track('track-1', 0), track('track-3', 1, 'Strings')],
        ),
      );
      const after = await commitDraft(app, userA, branchId, 'Add strings');

      const result = await diff(before.id, after.id);

      expect(result.summary.tracks.added).toBe(1);
      expect(result.tracksDiff.noteCounts['track-3']).toBe(8);
      expect(result.summary.notes.added).toBe(0);
    });

    it('API: reports an edited note as modified, not as removed and added', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([note('a'), note('b', { start: 480, velocity: 70 })]),
      );
      const before = await commitDraft(app, userA, branchId, 'Before');
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([
          note('a', { pitch: 67 }),
          note('b', { start: 480, velocity: 100 }),
        ]),
      );
      const after = await commitDraft(app, userA, branchId, 'Edit two notes');

      const result = await diff(before.id, after.id);

      expect(result.summary.notes).toEqual(
        expect.objectContaining({ added: 0, removed: 0, modified: 2 }),
      );
    });
  });

  describe('UC-46 Restore a version', () => {
    it('API: restores an earlier version as a new commit without losing history', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(app, userA, projectId, snapshot([note('n1')]));
      const verse = await commitDraft(app, userA, branchId, 'Verse idea');
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([note('n1'), note('n2', { start: 480 })]),
      );
      await commitDraft(app, userA, branchId, 'Add drums');

      await asUser(app, userA)
        .post(`/commits/${verse.id}/restore`)
        .send({ branch_id: branchId })
        .expect(201);

      const body = await history(branchId);
      expect(body.total).toBe(3);
      expect(body.items[0].message).toContain(verse.id.slice(0, 8));
      expect(body.items.map((item) => item.message)).toEqual(
        expect.arrayContaining(['Verse idea', 'Add drums']),
      );
    });
  });

  describe('UC-116 Working draft', () => {
    it('API: saves the working draft without creating a commit', async () => {
      const { projectId, branchId } = await newProject();

      await putDraft(
        app,
        userA,
        projectId,
        snapshot([note('bar4', { start: 5760 })]),
      );

      const draft = await asUser(app, userA)
        .get(`/projects/${projectId}/draft`)
        .expect(200);
      expect(
        (draft.body as { notes: Array<{ id: string }> }).notes.map((n) => n.id),
      ).toEqual(['bar4']);
      expect((await history(branchId)).total).toBe(0);
    });

    it('API: replaces an earlier draft with the latest one', async () => {
      const { projectId, branchId } = await newProject();
      await putDraft(
        app,
        userA,
        projectId,
        snapshot([note('bar4', { start: 5760 })]),
      );

      await putDraft(app, userA, projectId, snapshot([]));

      const draft = await asUser(app, userA)
        .get(`/projects/${projectId}/draft`)
        .expect(200);
      expect((draft.body as { notes: unknown[] }).notes).toEqual([]);
      expect((await history(branchId)).total).toBe(0);
    });
  });
});
