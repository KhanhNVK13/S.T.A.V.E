import type { DraftSnapshot } from '@stave/shared-types';
import { createSupabaseMock } from '../test-utils/supabase-mock';
import { MusicalFingerprintService } from './musical-fingerprint.service';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';

const SNAPSHOT: DraftSnapshot = {
  schemaVersion: 3,
  meta: { tempo: 96, timeSignature: [4, 4], ppq: 480 },
  tracks: [
    {
      id: 't1',
      name: 'Piano',
      order: 0,
      color: '#6366f1',
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      instrument: 'Acoustic Grand Piano',
    },
  ],
  notes: [
    {
      id: 'n1',
      trackId: 't1',
      pitch: 60,
      start: 0,
      duration: 480,
      velocity: 90,
    },
    {
      id: 'n2',
      trackId: 't1',
      pitch: 64,
      start: 480,
      duration: 480,
      velocity: 90,
    },
    {
      id: 'n3',
      trackId: 't1',
      pitch: 67,
      start: 960,
      duration: 480,
      velocity: 90,
    },
    {
      id: 'n4',
      trackId: 't1',
      pitch: 72,
      start: 1440,
      duration: 480,
      velocity: 90,
    },
  ],
};

describe('MusicalFingerprintService', () => {
  it('upserts computed fingerprint vector and metadata into project_musical_fingerprints', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        project_musical_fingerprints: [{ data: null }],
      },
    });
    const service = new MusicalFingerprintService(mock.client);

    await service.upsertForProject(PROJECT_ID, SNAPSHOT);

    expect(
      mock.builders.project_musical_fingerprints.upsert,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: PROJECT_ID,
        tempo: 96,
        tonality_tonic: 'C',
        tonality_mode: 'major',
        note_density: 4,
        embedding: expect.stringMatching(/^\[[0-9.-]+(,[0-9.-]+){23}\]$/),
      }),
      { onConflict: 'project_id' },
    );
  });

  it('deletes existing fingerprint row when snapshot has 0 notes', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        project_musical_fingerprints: [{ data: null }],
      },
    });
    const service = new MusicalFingerprintService(mock.client);

    await service.upsertForProject(PROJECT_ID, { ...SNAPSHOT, notes: [] });

    expect(
      mock.builders.project_musical_fingerprints.delete,
    ).toHaveBeenCalled();
    expect(mock.builders.project_musical_fingerprints.eq).toHaveBeenCalledWith(
      'project_id',
      PROJECT_ID,
    );
  });

  it('does not throw when upsert fails (e.g. unmigrated DB table)', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        project_musical_fingerprints: [
          { data: null, error: { message: 'relation does not exist' } },
        ],
      },
    });
    const service = new MusicalFingerprintService(mock.client);

    await expect(
      service.upsertForProject(PROJECT_ID, SNAPSHOT),
    ).resolves.toBeUndefined();
  });

  it('calls match_similar_projects RPC with clamped limit and falls back to [] on error', async () => {
    const matchId = '22222222-2222-4222-8222-222222222222';
    const mock = createSupabaseMock([], {
      rpc: {
        match_similar_projects: [
          {
            data: [
              {
                project_id: matchId,
                similarity: 0.934,
                tempo: 98,
                tonality_tonic: 'D',
                tonality_mode: 'major',
              },
            ],
          },
          { data: null, error: { message: 'function does not exist' } },
        ],
      },
    });
    const service = new MusicalFingerprintService(mock.client);

    const matches = await service.findSimilarProjectMatches(PROJECT_ID, 25);
    expect(mock.rpc).toHaveBeenCalledWith('match_similar_projects', {
      p_project_id: PROJECT_ID,
      p_limit: 12,
    });
    expect(matches).toEqual([
      {
        projectId: matchId,
        similarity: 0.934,
        tempo: 98,
        tonalityTonic: 'D',
        tonalityMode: 'major',
      },
    ]);

    const fallback = await service.findSimilarProjectMatches(PROJECT_ID, 6);
    expect(fallback).toEqual([]);
  });

  it('filters project IDs by tempoMin, tempoMax, and mode, falling back to null on DB error', async () => {
    const mock = createSupabaseMock([], {
      tables: {
        project_musical_fingerprints: [
          { data: [{ project_id: 'p1' }, { project_id: 'p2' }] },
          { data: null, error: { message: 'missing table' } },
        ],
      },
    });
    const service = new MusicalFingerprintService(mock.client);

    expect(await service.findProjectIdsByMusicalFilters({})).toBeNull();

    const ids = await service.findProjectIdsByMusicalFilters({
      tempoMin: 70,
      tempoMax: 95,
      mode: 'minor',
    });
    expect(ids).toEqual(['p1', 'p2']);
    expect(mock.builders.project_musical_fingerprints.gte).toHaveBeenCalledWith(
      'tempo',
      70,
    );
    expect(mock.builders.project_musical_fingerprints.lte).toHaveBeenCalledWith(
      'tempo',
      95,
    );
    expect(mock.builders.project_musical_fingerprints.eq).toHaveBeenCalledWith(
      'tonality_mode',
      'minor',
    );

    expect(
      await service.findProjectIdsByMusicalFilters({ mode: 'major' }),
    ).toBeNull();
  });
});
