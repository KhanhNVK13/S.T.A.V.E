import {
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ProjectAccessService } from './project-access.service';

/**
 * In-RAM mock of the SupabaseClient surface that ProjectAccessService uses:
 * `from('projects')` / `from('project_collaborators')` with
 * `.select().eq().eq().maybeSingle()`. No DB, no network — the test data
 * lives on the mock itself.
 */
type Row = Record<string, unknown>;

interface TableState {
  rows: Row[];
  error?: Row; // if set, the next query returns this as `error`
}

function mockSupabaseClient(state: Record<string, TableState>) {
  const buildQuery = (table: keyof TableState): any => {
    const filters: Array<(row: Row) => boolean> = [];
    const query: any = {};
    const applyFilter = (fn: (row: Row) => boolean): any => {
      filters.push(fn);
      return query;
    };
    query.select = (): any => query;
    query.eq = (col: string, val: unknown) =>
      applyFilter((row) => row[col] === val);
    query.maybeSingle = async (): Promise<{
      data: Row | null;
      error: Row | null;
    }> => {
      // mirror a real client's async surface (the `await` path in the service)
      await Promise.resolve();
      const t = state[table];
      if (t.error) return { data: null, error: t.error };
      const found = t.rows.filter((row) => filters.every((f) => f(row)));
      if (found.length === 0) return { data: null, error: null };
      // return only the selected columns
      return { data: found[0], error: null };
    };
    return query;
  };

  return {
    from: (table: string) => buildQuery(table as keyof TableState),
  } as any;
}

const projectRow: Row = {
  id: 'p-1',
  owner_id: 'owner-1',
  moderation_hidden_at: null,
};

function makeCollaborators(state: Record<string, TableState>): void {
  state.project_collaborators.rows = [
    {
      id: 'c-1',
      project_id: 'p-1',
      user_id: 'collab-edit',
      permission_level: 'edit',
      invited_by: 'owner-1',
      created_at: '2026-10-25T00:00:00Z',
      status: 'accepted',
    },
    {
      id: 'c-2',
      project_id: 'p-1',
      user_id: 'collab-view',
      permission_level: 'view',
      invited_by: 'owner-1',
      created_at: '2026-10-25T00:00:00Z',
      status: 'accepted',
    },
    {
      id: 'c-3',
      project_id: 'p-1',
      user_id: 'collab-pending',
      permission_level: 'edit',
      invited_by: 'owner-1',
      created_at: '2026-10-25T00:00:00Z',
      status: 'pending',
    },
  ];
}

function setup(collaborators = true): ProjectAccessService {
  const state: Record<string, TableState> = {
    projects: { rows: [projectRow] },
    project_collaborators: { rows: [] },
  };
  if (collaborators) makeCollaborators(state);
  return new ProjectAccessService(mockSupabaseClient(state));
}

describe('BE-PAC-01 ProjectAccessService.getAccess', () => {
  it('UTCID01 returns "owner" for the project owner', async () => {
    const service = setup(false);
    expect(await service.getAccess('p-1', 'owner-1')).toBe('owner');
  });

  it('UTCID02 returns "edit" for an accepted collaborator with edit permission', async () => {
    const service = setup();
    expect(await service.getAccess('p-1', 'collab-edit')).toBe('edit');
  });

  it('UTCID03 returns "view" for an accepted collaborator with view permission', async () => {
    const service = setup();
    expect(await service.getAccess('p-1', 'collab-view')).toBe('view');
  });

  it('UTCID04 returns null for a pending collaborator (BR-65)', async () => {
    const service = setup();
    expect(await service.getAccess('p-1', 'collab-pending')).toBeNull();
  });

  it('UTCID05 returns null for a stranger with no relation', async () => {
    const service = setup();
    expect(await service.getAccess('p-1', 'stranger')).toBeNull();
  });

  it('UTCID06 throws NotFoundException when the project does not exist', async () => {
    const service = setup();
    await expect(service.getAccess('missing', 'owner-1')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('UTCID07 throws NotFoundException when the project is hidden for moderation', async () => {
    const state: Record<string, TableState> = {
      projects: {
        rows: [{ ...projectRow, moderation_hidden_at: '2026-10-01T00:00:00Z' }],
      },
      project_collaborators: { rows: [] },
    };
    const service = new ProjectAccessService(mockSupabaseClient(state));
    await expect(service.getAccess('p-1', 'owner-1')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('BE-PAC-02 ProjectAccessService assertions', () => {
  it('UTCID01 assertCanView passes for owner, edit and view collaborators', async () => {
    const service = setup();
    await expect(
      service.assertCanView('p-1', 'owner-1'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertCanView('p-1', 'collab-edit'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertCanView('p-1', 'collab-view'),
    ).resolves.toBeUndefined();
  });

  it('UTCID02 assertCanView rejects pending collaborators and strangers', async () => {
    const service = setup();
    await expect(
      service.assertCanView('p-1', 'collab-pending'),
    ).rejects.toThrow(ForbiddenException);
    await expect(service.assertCanView('p-1', 'stranger')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('UTCID03 assertCanEdit passes for owner and edit collaborators only', async () => {
    const service = setup();
    await expect(
      service.assertCanEdit('p-1', 'owner-1'),
    ).resolves.toBeUndefined();
    await expect(
      service.assertCanEdit('p-1', 'collab-edit'),
    ).resolves.toBeUndefined();
    await expect(service.assertCanEdit('p-1', 'collab-view')).rejects.toThrow(
      ForbiddenException,
    );
    await expect(service.assertCanEdit('p-1', 'stranger')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('UTCID04 assertOwner passes for the owner and rejects everyone else', async () => {
    const service = setup();
    await expect(
      service.assertOwner('p-1', 'owner-1'),
    ).resolves.toBeUndefined();
    await expect(service.assertOwner('p-1', 'collab-edit')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('UTCID05 propagates a DB error as InternalServerErrorException', async () => {
    const state: Record<string, TableState> = {
      projects: { rows: [projectRow], error: { message: 'db down' } },
      project_collaborators: { rows: [] },
    };
    const service = new ProjectAccessService(mockSupabaseClient(state));
    await expect(service.getAccess('p-1', 'owner-1')).rejects.toThrow(
      InternalServerErrorException,
    );
  });
});

describe('BE-PAC-03 ProjectAccessService.assertCanRead', () => {
  const publicRow: Row = {
    ...projectRow,
    visibility: 'public',
    archived_at: null,
    'owner.status': 'active',
  };

  function setupRead(row: Row): ProjectAccessService {
    const state: Record<string, TableState> = {
      projects: { rows: [row] },
      project_collaborators: { rows: [] },
    };
    return new ProjectAccessService(mockSupabaseClient(state));
  }

  it('UTCID01 lets a stranger read a public project', async () => {
    await expect(
      setupRead(publicRow).assertCanRead('p-1', 'stranger'),
    ).resolves.toBeUndefined();
  });

  it('UTCID02 lets the owner read a private project', async () => {
    await expect(
      setupRead({ ...publicRow, visibility: 'private' }).assertCanRead(
        'p-1',
        'owner-1',
      ),
    ).resolves.toBeUndefined();
  });

  it('UTCID03 forbids a stranger on a private project', async () => {
    await expect(
      setupRead({ ...publicRow, visibility: 'private' }).assertCanRead(
        'p-1',
        'stranger',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('UTCID04 forbids a stranger on an archived public project', async () => {
    await expect(
      setupRead({
        ...publicRow,
        archived_at: '2026-10-01T00:00:00Z',
      }).assertCanRead('p-1', 'stranger'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('UTCID05 forbids a stranger when the owner account is not active', async () => {
    await expect(
      setupRead({ ...publicRow, 'owner.status': 'suspended' }).assertCanRead(
        'p-1',
        'stranger',
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('UTCID06 throws NotFoundException for a project hidden for moderation', async () => {
    await expect(
      setupRead({
        ...publicRow,
        moderation_hidden_at: '2026-10-01T00:00:00Z',
      }).assertCanRead('p-1', 'stranger'),
    ).rejects.toThrow(NotFoundException);
  });
});
