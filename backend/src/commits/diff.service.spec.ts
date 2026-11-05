import type { DraftNote, DraftSnapshot, DraftTrack } from '@stave/shared-types';
import {
  calculateTicksPerBar,
  deepEqual,
  isTrackModified,
  DiffService,
} from './diff.service';

// ============================================================================
// SHEET: BE-CMT-16 (calculateTicksPerBar)
// ============================================================================
describe('BE-CMT-16 calculateTicksPerBar(timeSignature, ppq)', () => {
  it('UTCID01 calculates 1920 ticks for [4, 4] meter at 480 PPQ', () => {
    expect(calculateTicksPerBar([4, 4], 480)).toBe(1920);
  });

  it('UTCID02 calculates 1440 ticks for [6, 8] meter at 480 PPQ', () => {
    expect(calculateTicksPerBar([6, 8], 480)).toBe(1440);
  });

  it('UTCID03 calculates 288 ticks for [3, 4] meter at 96 PPQ', () => {
    expect(calculateTicksPerBar([3, 4], 96)).toBe(288);
  });

  it('UTCID04 calculates 384 ticks for [4, 4] meter at 96 PPQ', () => {
    expect(calculateTicksPerBar([4, 4], 96)).toBe(384);
  });

  it('UTCID05 falls back to 4/4 meter giving 1920 ticks for empty array', () => {
    expect(calculateTicksPerBar([] as unknown as [number, number], 480)).toBe(
      1920,
    );
  });

  it('UTCID06 falls back to 4/4 meter giving 1920 ticks for null', () => {
    expect(calculateTicksPerBar(null as unknown as [number, number], 480)).toBe(
      1920,
    );
  });
});

// ============================================================================
// SHEET: BE-CMT-17 (deepEqual)
// ============================================================================
describe('BE-CMT-17 deepEqual(a, b)', () => {
  it('UTCID01 returns true for equal numbers 5 and 5', () => {
    expect(deepEqual(5, 5)).toBe(true);
  });

  it('UTCID02 returns false when comparing null with empty object {}', () => {
    expect(deepEqual(null, {})).toBe(false);
  });

  it('UTCID03 returns false for type mismatch string "5" vs number 5', () => {
    expect(deepEqual('5', 5)).toBe(false);
  });

  it('UTCID04 returns true for equal arrays [1, 2] and [1, 2]', () => {
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
  });

  it('UTCID05 returns false for arrays of different length [1, 2] vs [1]', () => {
    expect(deepEqual([1, 2], [1])).toBe(false);
  });

  it('UTCID06 returns false for arrays with different items [1, 2] vs [1, 3]', () => {
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
  });

  it('UTCID07 returns true for equal nested objects {x: 1, y: [2]}', () => {
    expect(deepEqual({ x: 1, y: [2] }, { x: 1, y: [2] })).toBe(true);
  });

  it('UTCID08 returns false when nested array item differs {x: 1, y: [2]} vs {x: 1, y: [3]}', () => {
    expect(deepEqual({ x: 1, y: [2] }, { x: 1, y: [3] })).toBe(false);
  });

  it('UTCID09 returns false when key count differs {x: 1} vs {x: 1, z: 2}', () => {
    expect(deepEqual({ x: 1 }, { x: 1, z: 2 })).toBe(false);
  });

  it('UTCID10 returns false for different numbers 5 vs 6', () => {
    expect(deepEqual(5, 6)).toBe(false);
  });

  it('UTCID11 returns true for array [1, 2] vs object {0: 1, 1: 2}', () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(true);
  });
});

// ============================================================================
// SHEET: BE-CMT-18 (isTrackModified)
// ============================================================================
describe('BE-CMT-18 isTrackModified(oldTrack, newTrack)', () => {
  const baseTrack: DraftTrack = {
    id: 't1',
    name: 'Piano',
    order: 0,
    color: '#6366f1',
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    instrument: 'piano',
  };

  it('UTCID01 returns false for identical track copy', () => {
    expect(isTrackModified(baseTrack, { ...baseTrack })).toBe(false);
  });

  it('UTCID02 returns true when name is changed', () => {
    expect(isTrackModified(baseTrack, { ...baseTrack, name: 'Keys' })).toBe(
      true,
    );
  });

  it('UTCID03 returns false when instrument is null vs undefined (equivalent)', () => {
    const tNull: DraftTrack = { ...baseTrack, instrument: null };
    const tUndefined: DraftTrack = {
      ...baseTrack,
      instrument: undefined as unknown as string | null,
    };
    expect(isTrackModified(tNull, tUndefined)).toBe(false);
  });

  it('UTCID04 returns true when instrument changes from "piano" to "violin"', () => {
    expect(
      isTrackModified(baseTrack, { ...baseTrack, instrument: 'violin' }),
    ).toBe(true);
  });

  it('UTCID05 returns true when order changes from 0 to 1', () => {
    expect(isTrackModified(baseTrack, { ...baseTrack, order: 1 })).toBe(true);
  });

  it('UTCID06 returns true when volume changes from 0.8 to 0.5', () => {
    expect(isTrackModified(baseTrack, { ...baseTrack, volume: 0.5 })).toBe(
      true,
    );
  });

  it('UTCID07 returns true when pan changes from 0 to -1 (boundary)', () => {
    expect(isTrackModified(baseTrack, { ...baseTrack, pan: -1 })).toBe(true);
  });

  it('UTCID08 returns true when muted is toggled', () => {
    expect(isTrackModified(baseTrack, { ...baseTrack, muted: true })).toBe(
      true,
    );
  });

  it('UTCID09 returns true when solo is toggled', () => {
    expect(isTrackModified(baseTrack, { ...baseTrack, solo: true })).toBe(true);
  });

  it('UTCID10 returns true when color is changed', () => {
    expect(isTrackModified(baseTrack, { ...baseTrack, color: '#ef4444' })).toBe(
      true,
    );
  });

  it('UTCID11 returns true when soundMap value changes {60: "s1"} to {60: "s2"}', () => {
    const t1: DraftTrack = { ...baseTrack, soundMap: { '60': 's1' } };
    const t2: DraftTrack = { ...baseTrack, soundMap: { '60': 's2' } };
    expect(isTrackModified(t1, t2)).toBe(true);
  });

  it('UTCID12 returns false when soundMap is undefined vs {} (equivalent empty)', () => {
    const t1: DraftTrack = { ...baseTrack, soundMap: undefined };
    const t2: DraftTrack = { ...baseTrack, soundMap: {} };
    expect(isTrackModified(t1, t2)).toBe(false);
  });

  it('UTCID13 returns true when soundMap gains a second entry', () => {
    const t1: DraftTrack = { ...baseTrack, soundMap: { '60': 's1' } };
    const t2: DraftTrack = {
      ...baseTrack,
      soundMap: { '60': 's1', '62': 's2' },
    };
    expect(isTrackModified(t1, t2)).toBe(true);
  });
});

// ============================================================================
// SHEET: BE-CMT-19 (DiffService.compareSnapshots)
// ============================================================================
describe('BE-CMT-19 DiffService.compareSnapshots(snapshotA, snapshotB)', () => {
  const service = new DiffService();

  const baseTrack: DraftTrack = {
    id: 'T1',
    name: 'Piano',
    order: 0,
    color: '#6366f1',
    volume: 0.8,
    pan: 0,
    muted: false,
    solo: false,
    instrument: 'Acoustic Grand Piano',
  };

  const baseSnapshot: DraftSnapshot = {
    schemaVersion: 3,
    meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    tracks: [baseTrack],
    notes: [
      {
        id: 'n1',
        trackId: 'T1',
        pitch: 60,
        start: 0,
        duration: 480,
        velocity: 100,
      },
    ],
  };

  it('UTCID01 returns areIdentical true and zero counts when A deep-equals B', () => {
    const diff = service.compareSnapshots(baseSnapshot, { ...baseSnapshot });
    expect(diff.areIdentical).toBe(true);
    expect(diff.summary.notes.totalChanges).toBe(0);
    expect(diff.summary.tracks.added).toBe(0);
  });

  it('UTCID02 counts added note n1 at start 0 in bar 1', () => {
    const snapA: DraftSnapshot = { ...baseSnapshot, notes: [] };
    const snapB: DraftSnapshot = { ...baseSnapshot };
    const diff = service.compareSnapshots(snapA, snapB);

    expect(diff.areIdentical).toBe(false);
    expect(diff.summary.notes.added).toBe(1);
    expect(diff.changesByBar[1].added).toHaveLength(1);
    expect(diff.changesByBar[1].added[0].id).toBe('n1');
  });

  it('UTCID03 counts removed note n2 at start 1920 in bar 2', () => {
    const note2: DraftNote = {
      id: 'n2',
      trackId: 'T1',
      pitch: 62,
      start: 1920,
      duration: 480,
      velocity: 100,
    };
    const snapA: DraftSnapshot = { ...baseSnapshot, notes: [note2] };
    const snapB: DraftSnapshot = { ...baseSnapshot, notes: [] };
    const diff = service.compareSnapshots(snapA, snapB);

    expect(diff.summary.notes.removed).toBe(1);
    expect(diff.changesByBar[2].removed).toHaveLength(1);
    expect(diff.changesByBar[2].removed[0].id).toBe('n2');
  });

  it('UTCID04 counts modified note n3 velocity changed at start 3840 in bar 3', () => {
    const n3A: DraftNote = {
      id: 'n3',
      trackId: 'T1',
      pitch: 60,
      start: 3840,
      duration: 480,
      velocity: 80,
    };
    const n3B: DraftNote = { ...n3A, velocity: 120 };
    const snapA: DraftSnapshot = { ...baseSnapshot, notes: [n3A] };
    const snapB: DraftSnapshot = { ...baseSnapshot, notes: [n3B] };
    const diff = service.compareSnapshots(snapA, snapB);

    expect(diff.summary.notes.modified).toBe(1);
    expect(diff.changesByBar[3].modified).toHaveLength(1);
  });

  it('UTCID05 groups note moved start 0 -> 2000 under new bar (bar 2)', () => {
    const n4A: DraftNote = {
      id: 'n4',
      trackId: 'T1',
      pitch: 60,
      start: 0,
      duration: 480,
      velocity: 80,
    };
    const n4B: DraftNote = { ...n4A, start: 2000 };
    const snapA: DraftSnapshot = { ...baseSnapshot, notes: [n4A] };
    const snapB: DraftSnapshot = { ...baseSnapshot, notes: [n4B] };
    const diff = service.compareSnapshots(snapA, snapB);

    expect(diff.summary.notes.modified).toBe(1);
    expect(diff.changesByBar[2].modified).toHaveLength(1);
  });

  it('UTCID06 records added track T2 with 3 noteCounts and notes.added remains 0', () => {
    const trackT2: DraftTrack = { ...baseTrack, id: 'T2', name: 'Drums' };
    const notesT2: DraftNote[] = [
      {
        id: 'n11',
        trackId: 'T2',
        pitch: 36,
        start: 0,
        duration: 240,
        velocity: 100,
      },
      {
        id: 'n12',
        trackId: 'T2',
        pitch: 38,
        start: 480,
        duration: 240,
        velocity: 100,
      },
      {
        id: 'n13',
        trackId: 'T2',
        pitch: 42,
        start: 960,
        duration: 240,
        velocity: 100,
      },
    ];
    const snapA: DraftSnapshot = {
      ...baseSnapshot,
      tracks: [baseTrack],
      notes: [],
    };
    const snapB: DraftSnapshot = {
      ...baseSnapshot,
      tracks: [baseTrack, trackT2],
      notes: notesT2,
    };
    const diff = service.compareSnapshots(snapA, snapB);

    expect(diff.summary.tracks.added).toBe(1);
    expect(diff.tracksDiff.noteCounts['T2']).toBe(3);
    expect(diff.summary.notes.added).toBe(0);
  });

  it('UTCID07 records removed track T1 with 2 noteCounts and notes.removed remains 0', () => {
    const notesT1: DraftNote[] = [
      {
        id: 'n1',
        trackId: 'T1',
        pitch: 60,
        start: 0,
        duration: 480,
        velocity: 100,
      },
      {
        id: 'n2',
        trackId: 'T1',
        pitch: 64,
        start: 480,
        duration: 480,
        velocity: 100,
      },
    ];
    const snapA: DraftSnapshot = {
      ...baseSnapshot,
      tracks: [baseTrack],
      notes: notesT1,
    };
    const snapB: DraftSnapshot = { ...baseSnapshot, tracks: [], notes: [] };
    const diff = service.compareSnapshots(snapA, snapB);

    expect(diff.summary.tracks.removed).toBe(1);
    expect(diff.tracksDiff.noteCounts['T1']).toBe(2);
    expect(diff.summary.notes.removed).toBe(0);
  });

  it('UTCID08 records modified track when volume changes', () => {
    const snapA: DraftSnapshot = { ...baseSnapshot };
    const snapB: DraftSnapshot = {
      ...baseSnapshot,
      tracks: [{ ...baseTrack, volume: 0.3 }],
    };
    const diff = service.compareSnapshots(snapA, snapB);

    expect(diff.summary.tracks.modified).toBe(1);
  });

  it('UTCID09 records meta change when tempo changes 120 -> 140', () => {
    const snapA: DraftSnapshot = { ...baseSnapshot };
    const snapB: DraftSnapshot = {
      ...baseSnapshot,
      meta: { ...baseSnapshot.meta, tempo: 140 },
    };
    const diff = service.compareSnapshots(snapA, snapB);

    expect(diff.areIdentical).toBe(false);
    expect(diff.metaChanges).toEqual([{ field: 'tempo', old: 120, new: 140 }]);
  });

  it('UTCID10 uses target B meter [3, 4] (1440 ticks) placing note at start 1440 in bar 2', () => {
    const snapA: DraftSnapshot = {
      ...baseSnapshot,
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      notes: [],
    };
    const noteAt1440: DraftNote = {
      id: 'n1',
      trackId: 'T1',
      pitch: 60,
      start: 1440,
      duration: 480,
      velocity: 100,
    };
    const snapB: DraftSnapshot = {
      ...baseSnapshot,
      meta: { tempo: 120, timeSignature: [3, 4], ppq: 480 },
      notes: [noteAt1440],
    };
    const diff = service.compareSnapshots(snapA, snapB);

    expect(diff.changesByBar[2]?.added).toHaveLength(1);
    expect(diff.metaChanges.some((m) => m.field === 'timeSignature')).toBe(
      true,
    );
  });
});
