import type { DraftNote, DraftSnapshot, DraftTrack } from '@stave/shared-types';

import {
  DiffService,
  calculateTicksPerBar,
  deepEqual,
  isTrackModified,
} from './diff.service';

// =============================================================================
// Fixtures
// =============================================================================

const track = (id: string, over: Partial<DraftTrack> = {}): DraftTrack => ({
  id,
  name: `Track ${id}`,
  order: 0,
  color: '#6366f1',
  muted: false,
  solo: false,
  volume: 1,
  pan: 0,
  instrument: null,
  ...over,
});

const note = (id: string, over: Partial<DraftNote> = {}): DraftNote => ({
  id,
  trackId: 'track-1',
  pitch: 60,
  start: 0,
  duration: 480,
  velocity: 100,
  ...over,
});

const snapshot = (over: Partial<DraftSnapshot> = {}): DraftSnapshot => ({
  schemaVersion: 3,
  meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
  tracks: [],
  notes: [],
  ...over,
});

// =============================================================================
// BE-CMT-16 — calculateTicksPerBar
// =============================================================================

describe('BE-CMT-16 DiffService.calculateTicksPerBar', () => {
  it('BE-CMT-16 UTCID01 (N): [4, 4] @ 480 ppq yields 1920 ticks per bar', () => {
    expect(calculateTicksPerBar([4, 4], 480)).toBe(1920);
  });

  it('BE-CMT-16 UTCID02 (N): [6, 8] @ 480 ppq yields 1440 ticks per bar', () => {
    expect(calculateTicksPerBar([6, 8], 480)).toBe(1440);
  });

  it('BE-CMT-16 UTCID03 (N): [3, 4] @ 96 ppq yields 288 ticks per bar', () => {
    expect(calculateTicksPerBar([3, 4], 96)).toBe(288);
  });

  it('BE-CMT-16 UTCID04 (B): empty timeSignature falls back to 4/4 @ 96 ppq yielding 384 ticks per bar', () => {
    expect(calculateTicksPerBar([] as unknown as [number, number], 96)).toBe(
      384,
    );
  });

  it('BE-CMT-16 UTCID05 (B): empty timeSignature falls back to 4/4 @ 480 ppq yielding 1920 ticks per bar', () => {
    expect(calculateTicksPerBar([] as unknown as [number, number], 480)).toBe(
      1920,
    );
  });

  it('BE-CMT-16 UTCID06 (A): null timeSignature falls back to 4/4 @ 480 ppq yielding 1920 ticks per bar', () => {
    expect(calculateTicksPerBar(null as unknown as [number, number], 480)).toBe(
      1920,
    );
  });
});

// =============================================================================
// BE-CMT-17 — deepEqual
// =============================================================================

describe('BE-CMT-17 DiffService.deepEqual', () => {
  it('BE-CMT-17 UTCID01 (N): 5 and 5 are deeply equal', () => {
    expect(deepEqual(5, 5)).toBe(true);
  });

  it('BE-CMT-17 UTCID02 (A): null and an object are not deeply equal', () => {
    expect(deepEqual(null, {})).toBe(false);
  });

  it('BE-CMT-17 UTCID03 (A): "5" and 5 are not deeply equal (type mismatch)', () => {
    expect(deepEqual('5', 5)).toBe(false);
  });

  it('BE-CMT-17 UTCID04 (N): [1, 2] and [1, 2] are deeply equal', () => {
    expect(deepEqual([1, 2], [1, 2])).toBe(true);
  });

  it('BE-CMT-17 UTCID05 (B): [1, 2] and [1] are not deeply equal (array length)', () => {
    expect(deepEqual([1, 2], [1])).toBe(false);
  });

  it('BE-CMT-17 UTCID06 (A): [1, 2] and [1, 3] are not deeply equal (array items)', () => {
    expect(deepEqual([1, 2], [1, 3])).toBe(false);
  });

  it('BE-CMT-17 UTCID07 (N): { x: 1, y: [2] } and { x: 1, y: [2] } are deeply equal', () => {
    expect(deepEqual({ x: 1, y: [2] }, { x: 1, y: [2] })).toBe(true);
  });

  it('BE-CMT-17 UTCID08 (A): { x: 1, y: [2] } and { x: 1, y: [3] } are not deeply equal (nested value)', () => {
    expect(deepEqual({ x: 1, y: [2] }, { x: 1, y: [3] })).toBe(false);
  });

  it('BE-CMT-17 UTCID09 (B): { x: 1 } and { x: 1, z: 2 } are not deeply equal (key count)', () => {
    expect(deepEqual({ x: 1 }, { x: 1, z: 2 })).toBe(false);
  });

  it('BE-CMT-17 UTCID10 (A): 5 and 6 are not deeply equal', () => {
    expect(deepEqual(5, 6)).toBe(false);
  });

  it('BE-CMT-17 UTCID11 (B): [1, 2] and { 0: 1, 1: 2 } are deeply equal (same key/value pairs)', () => {
    expect(deepEqual([1, 2], { 0: 1, 1: 2 })).toBe(true);
  });
});

// =============================================================================
// BE-CMT-18 — isTrackModified
// =============================================================================

describe('BE-CMT-18 DiffService.isTrackModified', () => {
  const base = track('track-1');

  it('BE-CMT-18 UTCID01 (N): an identical copy of a track is not modified', () => {
    expect(isTrackModified(base, { ...base })).toBe(false);
  });

  it('BE-CMT-18 UTCID02 (N): a changed name marks the track modified', () => {
    expect(isTrackModified(base, { ...base, name: 'Guitar' })).toBe(true);
  });

  it('BE-CMT-18 UTCID03 (B): instrument null versus undefined does not mark the track modified', () => {
    expect(
      isTrackModified(base, {
        ...base,
        instrument: undefined as unknown as null,
      }),
    ).toBe(false);
  });

  it('BE-CMT-18 UTCID04 (N): a changed instrument marks the track modified', () => {
    expect(
      isTrackModified(base, { ...base, instrument: 'Acoustic Grand Piano' }),
    ).toBe(true);
  });

  it('BE-CMT-18 UTCID05 (N): a changed order marks the track modified', () => {
    expect(isTrackModified(base, { ...base, order: 1 })).toBe(true);
  });

  it('BE-CMT-18 UTCID06 (N): a changed volume marks the track modified', () => {
    expect(isTrackModified(base, { ...base, volume: 0.5 })).toBe(true);
  });

  it('BE-CMT-18 UTCID07 (B): a changed pan marks the track modified', () => {
    expect(isTrackModified(base, { ...base, pan: -1 })).toBe(true);
  });

  it('BE-CMT-18 UTCID08 (N): toggling muted marks the track modified', () => {
    expect(isTrackModified(base, { ...base, muted: true })).toBe(true);
  });

  it('BE-CMT-18 UTCID09 (N): toggling solo marks the track modified', () => {
    expect(isTrackModified(base, { ...base, solo: true })).toBe(true);
  });

  it('BE-CMT-18 UTCID10 (N): a changed color marks the track modified', () => {
    expect(isTrackModified(base, { ...base, color: '#ff0000' })).toBe(true);
  });

  it('BE-CMT-18 UTCID11 (N): a changed soundMap value marks the track modified', () => {
    expect(
      isTrackModified(base, {
        ...base,
        soundMap: { '60': 's2' },
      }),
    ).toBe(true);
  });

  it('BE-CMT-18 UTCID12 (B): soundMap undefined versus an empty object does not mark the track modified', () => {
    expect(isTrackModified(base, { ...base, soundMap: {} })).toBe(false);
  });

  it('BE-CMT-18 UTCID13 (N): gaining a second soundMap entry marks the track modified', () => {
    expect(
      isTrackModified(base, {
        ...base,
        soundMap: { '60': 's1', '62': 's3' },
      }),
    ).toBe(true);
  });
});

// =============================================================================
// BE-CMT-19 — DiffService.compareSnapshots
// =============================================================================

describe('BE-CMT-19 DiffService.compareSnapshots', () => {
  let service: DiffService;

  beforeEach(() => {
    service = new DiffService();
  });

  it('BE-CMT-19 UTCID01 (N): deeply equal snapshots report areIdentical with zero counts', () => {
    const a = snapshot({ tracks: [track('t1')], notes: [note('n1')] });
    const b = snapshot({ tracks: [track('t1')], notes: [note('n1')] });

    const result = service.compareSnapshots(a, b);

    expect(result.areIdentical).toBe(true);
    expect(result.metaChanges).toEqual([]);
    expect(result.summary.notes).toEqual({
      added: 0,
      removed: 0,
      modified: 0,
      totalChanges: 0,
    });
    expect(result.summary.tracks).toEqual({
      added: 0,
      removed: 0,
      modified: 0,
    });
    expect(result.changesByBar).toEqual({});
    expect(result.tracksDiff.noteCounts).toEqual({});
  });

  it('BE-CMT-19 UTCID02 (N): a note added at start 0 is counted and grouped in bar 1', () => {
    const a = snapshot({ tracks: [track('t1')], notes: [note('n1')] });
    const b = snapshot({
      tracks: [track('t1')],
      notes: [note('n1'), note('n2')],
    });

    const result = service.compareSnapshots(a, b);

    expect(result.areIdentical).toBe(false);
    expect(result.summary.notes.added).toBe(1);
    expect(result.summary.notes.totalChanges).toBe(1);
    expect(result.changesByBar[1].added.map((n) => n.id)).toEqual(['n2']);
  });

  it('BE-CMT-19 UTCID03 (N): a note removed at start 1920 is counted and grouped in bar 2', () => {
    const a = snapshot({
      tracks: [track('t1')],
      notes: [note('n1'), note('n2', { start: 1920 })],
    });
    const b = snapshot({ tracks: [track('t1')], notes: [note('n1')] });

    const result = service.compareSnapshots(a, b);

    expect(result.summary.notes.removed).toBe(1);
    expect(result.changesByBar[2].removed.map((n) => n.id)).toEqual(['n2']);
  });

  it('BE-CMT-19 UTCID04 (N): a changed note velocity is counted and grouped in bar 3', () => {
    const a = snapshot({
      tracks: [track('t1')],
      notes: [note('n1'), note('n3', { start: 3840, velocity: 100 })],
    });
    const b = snapshot({
      tracks: [track('t1')],
      notes: [note('n1'), note('n3', { start: 3840, velocity: 64 })],
    });

    const result = service.compareSnapshots(a, b);

    expect(result.summary.notes.modified).toBe(1);
    expect(result.changesByBar[3].modified).toHaveLength(1);
    expect(result.changesByBar[3].modified[0].old.velocity).toBe(100);
    expect(result.changesByBar[3].modified[0].new.velocity).toBe(64);
  });

  it('BE-CMT-19 UTCID05 (B): a moved note is grouped by its new start (bar 2)', () => {
    const a = snapshot({
      tracks: [track('t1')],
      notes: [note('n1'), note('n4', { start: 0 })],
    });
    const b = snapshot({
      tracks: [track('t1')],
      notes: [note('n1'), note('n4', { start: 2000 })],
    });

    const result = service.compareSnapshots(a, b);

    expect(result.summary.notes.modified).toBe(1);
    expect(result.changesByBar[2].modified).toHaveLength(1);
    expect(result.changesByBar[2].modified[0].new.start).toBe(2000);
  });

  it('BE-CMT-19 UTCID06 (N): a whole added track is counted with its 3 notes and no individual note additions', () => {
    const a = snapshot({ tracks: [track('t1')], notes: [] });
    const b = snapshot({
      tracks: [track('t1'), track('t2')],
      notes: [
        note('m1', { trackId: 't2' }),
        note('m2', { trackId: 't2' }),
        note('m3', { trackId: 't2' }),
      ],
    });

    const result = service.compareSnapshots(a, b);

    expect(result.summary.tracks.added).toBe(1);
    expect(result.tracksDiff.added.map((t) => t.id)).toEqual(['t2']);
    expect(result.tracksDiff.noteCounts['t2']).toBe(3);
    expect(result.summary.notes.added).toBe(0);
  });

  it('BE-CMT-19 UTCID07 (N): a whole removed track is counted with its 2 notes and no individual note removals', () => {
    const a = snapshot({
      tracks: [track('t1')],
      notes: [note('m1', { trackId: 't1' }), note('m2', { trackId: 't1' })],
    });
    const b = snapshot({ tracks: [], notes: [] });

    const result = service.compareSnapshots(a, b);

    expect(result.summary.tracks.removed).toBe(1);
    expect(result.tracksDiff.removed.map((t) => t.id)).toEqual(['t1']);
    expect(result.tracksDiff.noteCounts['t1']).toBe(2);
    expect(result.summary.notes.removed).toBe(0);
  });

  it('BE-CMT-19 UTCID08 (N): a changed track volume marks the track modified', () => {
    const a = snapshot({ tracks: [track('t1', { volume: 1 })], notes: [] });
    const b = snapshot({ tracks: [track('t1', { volume: 0.5 })], notes: [] });

    const result = service.compareSnapshots(a, b);

    expect(result.summary.tracks.modified).toBe(1);
    expect(result.tracksDiff.modified).toHaveLength(1);
    expect(result.tracksDiff.modified[0].new.volume).toBe(0.5);
  });

  it('BE-CMT-19 UTCID09 (N): a changed tempo is reported in metaChanges', () => {
    const a = snapshot({
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
    });
    const b = snapshot({
      meta: { tempo: 140, timeSignature: [4, 4], ppq: 480 },
    });

    const result = service.compareSnapshots(a, b);

    expect(result.areIdentical).toBe(false);
    expect(result.metaChanges).toEqual([
      { field: 'tempo', old: 120, new: 140 },
    ]);
  });

  it('BE-CMT-19 UTCID10 (B): the target 3/4 signature gives 1440 ticks per bar, putting a note at 1440 in bar 2', () => {
    const a = snapshot({
      meta: { tempo: 120, timeSignature: [4, 4], ppq: 480 },
      tracks: [track('t1')],
      notes: [],
    });
    const b = snapshot({
      meta: { tempo: 120, timeSignature: [3, 4], ppq: 480 },
      tracks: [track('t1')],
      notes: [note('n1', { start: 1440 })],
    });

    const result = service.compareSnapshots(a, b);

    expect(result.changesByBar[2].added.map((n) => n.id)).toEqual(['n1']);
    expect(result.metaChanges).toContainEqual({
      field: 'timeSignature',
      old: [4, 4],
      new: [3, 4],
    });
  });
});
