import { ConflictException } from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import type { CustomSoundsService } from '../custom-sounds/custom-sounds.service';
import type { ProjectAccessService } from '../project-access/project-access.service';
import type { ActiveBranchService } from '../active-branch/active-branch.service';
import type { AudioSketchesService } from '../audio-sketches/audio-sketches.service';
import { ProjectsService } from './projects.service';

const projectId = '33333333-3333-4333-8333-333333333333';
const ownerId = '44444444-4444-4444-8444-444444444444';

function makeService(projects: Array<Record<string, unknown>>) {
  const mock = createSupabaseMock([], { tables: { projects } });
  const service = new ProjectsService(
    mock.client,
    {} as CustomSoundsService,
    {} as ProjectAccessService,
    {} as ActiveBranchService,
    {} as AudioSketchesService,
  );
  return { service, ...mock };
}

describe('ProjectsService.updateOwned', () => {
  it('refuses to edit an archived project', async () => {
    const { service, builders } = makeService([
      { data: { id: projectId, owner_id: ownerId, archived_at: '2026-10-01' } },
    ]);
    await expect(
      service.updateOwned(projectId, ownerId, { name: 'new' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(builders.projects.update).not.toHaveBeenCalled();
  });

  it('updates an active project', async () => {
    const row = { id: projectId, owner_id: ownerId, archived_at: null };
    const { service, builders } = makeService([
      { data: row },
      { data: { ...row, name: 'new' } },
    ]);
    await service.updateOwned(projectId, ownerId, { name: 'new' });
    expect(builders.projects.update).toHaveBeenCalledWith({ name: 'new' });
  });
});
