import { summarizeSnapshot } from './reports.logic';

describe('summarizeSnapshot', () => {
  it('đếm track, nốt và liệt kê tên + nhạc cụ', () => {
    const result = summarizeSnapshot({
      schemaVersion: 3,
      meta: {},
      tracks: [
        { id: 't1', name: 'Lead', instrument: 'Acoustic Grand Piano' },
        { id: 't2', name: 'Bass', instrument: null },
      ],
      notes: [
        { id: 'n1', trackId: 't1', pitch: 60, start: 0, duration: 10 },
        { id: 'n2', trackId: 't1', pitch: 62, start: 10, duration: 10 },
        { id: 'n3', trackId: 't2', pitch: 40, start: 0, duration: 10 },
      ],
    });
    expect(result).toEqual({
      trackCount: 2,
      noteCount: 3,
      tracks: [
        { name: 'Lead', instrument: 'Acoustic Grand Piano' },
        { name: 'Bass', instrument: null },
      ],
    });
  });

  it('chỉ trả tên và nhạc cụ của track, không lộ id, màu, soundMap hay nốt', () => {
    const result = summarizeSnapshot({
      tracks: [
        {
          id: 't1',
          name: 'Lead',
          color: '#ff0000',
          instrument: 'Flute',
          soundMap: { '60': 'sound-1' },
        },
      ],
      notes: [{ id: 'n1', trackId: 't1', pitch: 60, start: 0, duration: 1 }],
    });
    expect(Object.keys(result.tracks[0]).sort()).toEqual([
      'instrument',
      'name',
    ]);
    expect(JSON.stringify(result)).not.toContain('sound-1');
    expect(JSON.stringify(result)).not.toContain('"pitch"');
    expect(result).not.toHaveProperty('notes');
    expect(result).not.toHaveProperty('snapshot');
  });

  it.each([null, undefined, 5, 'x', [], {}])(
    'snapshot không hợp lệ (%p) -> toàn số 0',
    (value) => {
      expect(summarizeSnapshot(value)).toEqual({
        trackCount: 0,
        noteCount: 0,
        tracks: [],
      });
    },
  );

  it('thiếu mảng tracks hoặc notes thì phần đó là 0', () => {
    expect(summarizeSnapshot({ notes: [{}, {}] })).toEqual({
      trackCount: 0,
      noteCount: 2,
      tracks: [],
    });
    expect(summarizeSnapshot({ tracks: [{ name: 'A' }] })).toEqual({
      trackCount: 1,
      noteCount: 0,
      tracks: [{ name: 'A', instrument: null }],
    });
  });

  it('cắt tên track dài và bỏ ký tự điều khiển', () => {
    const result = summarizeSnapshot({
      tracks: [{ name: `${'a'.repeat(100)}\u0000`, instrument: 'Flute\n' }],
    });
    expect(result.tracks[0].name).toHaveLength(80);
    expect(result.tracks[0].name).not.toContain('\u0000');
    expect(result.tracks[0].instrument).toBe('Flute');
  });

  it('track thiếu tên hoặc sai kiểu được đặt tên rỗng, nhạc cụ sai kiểu là null', () => {
    const result = summarizeSnapshot({
      tracks: [{ name: 5, instrument: 7 }, null, 'x'],
    });
    expect(result.trackCount).toBe(3);
    expect(result.tracks[0]).toEqual({ name: '', instrument: null });
  });

  it('không đổi dữ liệu đầu vào', () => {
    const input = { tracks: [{ name: 'A', instrument: null }], notes: [{}] };
    const copy = JSON.parse(JSON.stringify(input)) as unknown;
    summarizeSnapshot(input);
    expect(input).toEqual(copy);
  });
});
