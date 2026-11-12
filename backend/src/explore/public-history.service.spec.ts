import { NotFoundException } from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { ProjectAccessService } from '../project-access/project-access.service';
import { DiffService } from '../commits/diff.service';
import { PublicHistoryService } from './public-history.service';

const projectId = '11111111-1111-4111-8111-111111111111';
const branchA = '22222222-2222-4222-8222-222222222222';
const branchB = '33333333-3333-4333-8333-333333333333';
const commit1 = '44444444-4444-4444-8444-444444444444';
const commit2 = '55555555-5555-4555-8555-555555555555';
const author = '66666666-6666-4666-8666-666666666666';

type Tables = NonNullable<Parameters<typeof createSupabaseMock>[1]>['tables'];

function makeSnapshot(noteCount: number) {
  return {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [
      {
        id: 't1',
        name: 'Lead',
        instrument: 'Piano',
        volume: 1,
        pan: 0,
        muted: false,
        solo: false,
        color: '#fff',
        order: 0,
      },
    ],
    notes: Array.from({ length: noteCount }, (_, i) => ({
      id: `n${i}`,
      trackId: 't1',
      pitch: 60,
      start: i * 480,
      duration: 480,
      velocity: 90,
    })),
  };
}

function make(tables: Tables) {
  const mock = createSupabaseMock([], { tables });
  const access = new ProjectAccessService(mock.client);
  const service = new PublicHistoryService(
    mock.client,
    access,
    new DiffService(),
  );
  return { service, ...mock };
}

const publicProject = { data: { id: projectId } };

describe('BE-PHX-01 ProjectAccessService.assertPublicReadable', () => {
  function accessWith(projects: unknown[]) {
    const mock = createSupabaseMock([], { tables: { projects } as Tables });
    return { access: new ProjectAccessService(mock.client), ...mock };
  }

  it('UTCID01 passes for a public, active, visible project and filters on every condition', async () => {
    const { access, builders } = accessWith([publicProject]);
    await expect(
      access.assertPublicReadable(projectId),
    ).resolves.toBeUndefined();
    const b = builders.projects;
    expect(b.eq).toHaveBeenCalledWith('visibility', 'public');
    expect(b.eq).toHaveBeenCalledWith('owner.status', 'active');
    expect(b.is).toHaveBeenCalledWith('archived_at', null);
    expect(b.is).toHaveBeenCalledWith('moderation_hidden_at', null);
  });

  it('UTCID02 a project that fails any condition (or does not exist) is a uniform 404', async () => {
    const { access } = accessWith([{ data: null }]);
    await expect(access.assertPublicReadable(projectId)).rejects.toThrow(
      new NotFoundException('Project not found'),
    );
  });

  it('UTCID03 a database error is a 500, never a silent pass', async () => {
    const { access } = accessWith([{ data: null, error: { message: 'down' } }]);
    await expect(access.assertPublicReadable(projectId)).rejects.toThrow(
      /Failed to check project visibility/,
    );
  });
});

describe('BE-PHX-02 PublicHistoryService', () => {
  it('UTCID01 every method is gated: a non-public project returns 404 before any data is read', async () => {
    const { service, builders } = make({
      projects: [
        { data: null },
        { data: null },
        { data: null },
        { data: null },
      ],
    });
    await expect(service.listBranches(projectId)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.listCommits(projectId, {})).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.getCommit(projectId, commit1)).rejects.toThrow(
      NotFoundException,
    );
    await expect(service.compare(projectId, commit1, commit2)).rejects.toThrow(
      NotFoundException,
    );
    expect(builders.branches).toBeUndefined();
    expect(builders.commits).toBeUndefined();
  });

  it('UTCID02 listCommits returns metadata only: no snapshot, no email, with the author', async () => {
    const { service, builders } = make({
      projects: [publicProject],
      branches: [{ data: [{ id: branchA }, { id: branchB }] }],
      commits: [
        {
          data: [
            {
              id: commit1,
              branch_id: branchA,
              author_id: author,
              message: 'first',
              created_at: '2026-11-01T00:00:00Z',
              parent_commit_id: null,
              merged_from_commit_id: null,
            },
          ],
          count: 1,
        },
      ],
      users: [
        {
          data: [
            {
              id: author,
              username: 'an',
              display_name: 'An',
              avatar_url: null,
              email: 'secret@example.test',
            },
          ],
        },
      ],
    });
    const page = await service.listCommits(projectId, { page: 1, limit: 20 });
    expect(page.total).toBe(1);
    expect(page.items[0]).toEqual({
      id: commit1,
      branch_id: branchA,
      parent_commit_id: null,
      merged_from_commit_id: null,
      message: 'first',
      created_at: '2026-11-01T00:00:00Z',
      author: {
        id: author,
        username: 'an',
        display_name: 'An',
        avatar_url: null,
      },
    });
    expect(JSON.stringify(page)).not.toContain('secret@example.test');
    expect(builders.commits.select.mock.calls[0][0]).not.toContain('snapshot');
    expect(builders.users.select.mock.calls[0][0]).not.toContain('email');
    expect(builders.commits.in).toHaveBeenCalledWith('branch_id', [
      branchA,
      branchB,
    ]);
  });

  it('UTCID03 listCommits refuses a branch that belongs to another project', async () => {
    const { service, builders } = make({
      projects: [publicProject],
      branches: [{ data: [{ id: branchA }] }],
    });
    await expect(
      service.listCommits(projectId, { branchId: branchB }),
    ).rejects.toThrow(new NotFoundException('Branch not found'));
    expect(builders.commits).toBeUndefined();
  });

  it('UTCID04 caps the page size at 50', async () => {
    const { service, builders } = make({
      projects: [publicProject],
      branches: [{ data: [{ id: branchA }] }],
      commits: [{ data: [], count: 0 }],
    });
    const page = await service.listCommits(projectId, { limit: 9999 });
    expect(page.limit).toBe(50);
    expect(builders.commits.range).toHaveBeenCalledWith(0, 49);
  });

  it('UTCID05 getCommit returns a summary, never notes or the raw snapshot', async () => {
    const { service } = make({
      projects: [publicProject],
      branches: [{ data: [{ id: branchA }] }],
      commits: [
        {
          data: {
            id: commit1,
            branch_id: branchA,
            author_id: null,
            message: 'm',
            created_at: '2026-11-01T00:00:00Z',
            parent_commit_id: null,
            merged_from_commit_id: null,
            snapshot: makeSnapshot(3),
          },
        },
      ],
    });
    const detail = await service.getCommit(projectId, commit1);
    expect(detail.summary).toEqual({
      trackCount: 1,
      noteCount: 3,
      tempo: 120,
      tracks: [{ name: 'Lead', instrument: 'Piano' }],
    });
    expect(detail).not.toHaveProperty('snapshot');
    expect(JSON.stringify(detail)).not.toContain('"pitch"');
  });

  it('UTCID06 getCommit of a commit from another project is 404', async () => {
    const { service } = make({
      projects: [publicProject],
      branches: [{ data: [{ id: branchA }] }],
      commits: [{ data: null }],
    });
    await expect(service.getCommit(projectId, commit1)).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('UTCID07 compare diffs two commits of the project and scopes the query to its branches', async () => {
    const { service, builders } = make({
      projects: [publicProject],
      branches: [{ data: [{ id: branchA }] }],
      commits: [
        {
          data: [
            { id: commit1, snapshot: makeSnapshot(1) },
            { id: commit2, snapshot: makeSnapshot(3) },
          ],
        },
      ],
    });
    const diff = await service.compare(projectId, commit1, commit2);
    expect(diff.areIdentical).toBe(false);
    expect(diff.summary.notes.added).toBe(2);
    expect(builders.commits.in).toHaveBeenCalledWith('branch_id', [branchA]);
  });

  it('UTCID08 compare answers 404 when either commit is missing from the project', async () => {
    const { service } = make({
      projects: [publicProject],
      branches: [{ data: [{ id: branchA }] }],
      commits: [{ data: [{ id: commit1, snapshot: makeSnapshot(1) }] }],
    });
    await expect(service.compare(projectId, commit1, commit2)).rejects.toThrow(
      new NotFoundException('Commit not found'),
    );
  });

  it('UTCID09 compare refuses to compare a commit with itself', async () => {
    const { service } = make({ projects: [publicProject] });
    await expect(service.compare(projectId, commit1, commit1)).rejects.toThrow(
      /different/,
    );
  });
});

describe('BE-PHX-03 PublicHistoryService.getPreview', () => {
  it('UTCID01 returns the default branch head snapshot of a public project, without custom sound maps', async () => {
    const snapshot = makeSnapshot(2);
    (snapshot.tracks[0] as Record<string, unknown>).soundMap = {
      '36': 'sound-1',
    };
    const { service, builders } = make({
      projects: [publicProject],
      branches: [{ data: { head_commit_id: commit1 } }],
      commits: [{ data: { id: commit1, snapshot } }],
    });
    const preview = await service.getPreview(projectId);
    expect(preview.commitId).toBe(commit1);
    expect(preview.snapshot?.notes).toHaveLength(2);
    expect(preview.snapshot?.tracks[0]).not.toHaveProperty('soundMap');
    expect(preview.snapshot?.meta.tempo).toBe(120);
    expect(builders.branches.eq).toHaveBeenCalledWith('is_default', true);
  });

  it('UTCID02 a project without any commit answers an empty preview, not an error', async () => {
    const { service } = make({
      projects: [publicProject],
      branches: [{ data: { head_commit_id: null } }],
    });
    await expect(service.getPreview(projectId)).resolves.toEqual({
      commitId: null,
      snapshot: null,
    });
  });

  it('UTCID03 a non-public project is a 404 before any branch or commit is read', async () => {
    const { service, builders } = make({ projects: [{ data: null }] });
    await expect(service.getPreview(projectId)).rejects.toThrow(
      NotFoundException,
    );
    expect(builders.branches).toBeUndefined();
    expect(builders.commits).toBeUndefined();
  });

  it('UTCID04 a database error while reading the head commit is a 500, never an empty preview', async () => {
    const { service } = make({
      projects: [publicProject],
      branches: [{ data: { head_commit_id: commit1 } }],
      commits: [{ data: null, error: { message: 'boom' } }],
    });
    await expect(service.getPreview(projectId)).rejects.toThrow(
      /Could not load preview/,
    );
  });
});

describe('BE-PHX-04 PublicHistoryService.getPreviewForMember', () => {
  const userId = '77777777-7777-4777-8777-777777777777';

  it('UTCID01 the owner of a private project gets the default branch head snapshot', async () => {
    const { service } = make({
      projects: [
        {
          data: {
            id: projectId,
            owner_id: userId,
            visibility: 'private',
            archived_at: null,
          },
        },
      ],
      branches: [{ data: { head_commit_id: commit1 } }],
      commits: [{ data: { id: commit1, snapshot: makeSnapshot(1) } }],
    });
    const preview = await service.getPreviewForMember(projectId, userId);
    expect(preview.commitId).toBe(commit1);
    expect(preview.snapshot?.notes).toHaveLength(1);
  });

  it('UTCID02 a stranger cannot preview a private project and nothing is read', async () => {
    const { service, builders } = make({
      projects: [
        {
          data: {
            id: projectId,
            owner_id: '88888888-8888-4888-8888-888888888888',
            visibility: 'private',
            archived_at: null,
          },
        },
      ],
      collaborators: [{ data: null }],
    });
    await expect(
      service.getPreviewForMember(projectId, userId),
    ).rejects.toThrow();
    expect(builders.branches).toBeUndefined();
    expect(builders.commits).toBeUndefined();
  });
});
