import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { SwitchBranchDto } from './switch-branch.dto';

describe('SwitchBranchDto track handling', () => {
  const pipe = new ValidationPipe({ whitelist: true, transform: true });
  const UUID_A = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const UUID_B = 'b1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

  const track = {
    id: 't1',
    name: `Lead${String.fromCharCode(0)}`,
    order: 2,
    color: '#112233',
    volume: 0.5,
    pan: -0.25,
    muted: true,
    solo: true,
    isMuted: true,
    isSolo: false,
    instrument: 'Acoustic Grand Piano',
    soundMap: { '36': 'sound-1' },
  };

  const transform = (tracks: unknown) =>
    pipe.transform(
      {
        currentBranchId: UUID_A,
        targetBranchId: UUID_B,
        currentDraft: { tracks, notes: [] },
      },
      { type: 'body', metatype: SwitchBranchDto },
    ) as Promise<SwitchBranchDto>;

  it('keeps every track field and only cleans the name', async () => {
    const out = await transform([track]);
    expect(out.currentDraft.tracks).toHaveLength(1);
    expect({ ...out.currentDraft.tracks![0] }).toEqual({
      ...track,
      name: 'Lead',
    });
  });

  it('rejects a track name over 50 characters', async () => {
    await expect(
      transform([{ ...track, name: 'a'.repeat(51) }]),
    ).rejects.toThrow();
  });

  it('accepts a missing tracks array', async () => {
    const out = await transform(undefined);
    expect(out.currentDraft.tracks).toBeUndefined();
  });
});
