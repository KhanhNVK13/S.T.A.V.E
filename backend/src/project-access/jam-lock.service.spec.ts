import {
  ConflictException,
  InternalServerErrorException,
} from '@nestjs/common';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { JamLockService } from './jam-lock.service';

describe('JamLockService.assertNoActiveJam(projectId)', () => {
  const makeService = (result: { data?: unknown; error?: unknown }) => {
    const mock = createSupabaseMock([result]);
    return { service: new JamLockService(mock.client), builder: mock.builder };
  };

  it('resolves when no active jam event uses the project', async () => {
    const { service, builder } = makeService({ data: null, error: null });

    await expect(service.assertNoActiveJam('proj-1')).resolves.toBeUndefined();

    expect(builder.eq).toHaveBeenCalledWith('jam_project_id', 'proj-1');
    expect(builder.eq).toHaveBeenCalledWith('status', 'active');
  });

  it('throws a conflict with code JAM_ACTIVE while a jam is running on the project', async () => {
    const { service } = makeService({ data: { id: 'ev-1' }, error: null });

    const promise = service.assertNoActiveJam('proj-1');

    await expect(promise).rejects.toBeInstanceOf(ConflictException);
    await expect(promise).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'JAM_ACTIVE' }),
    });
  });

  it('fails closed when the jam status cannot be read', async () => {
    const { service } = makeService({
      data: null,
      error: { message: 'db down' },
    });

    await expect(service.assertNoActiveJam('proj-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
