import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  collectSoundIds,
  loadCustomSoundBuffers,
  resolveAndLoadCustomSounds,
} from './custom-sound-buffers';
import * as apiClient from './api-client';

const mockAudioBuffer = {
  duration: 1,
  length: 44100,
  numberOfChannels: 1,
  sampleRate: 44100,
} as AudioBuffer;

let decodeShouldFail = false;

class MockOfflineAudioContext {
  decodeAudioData(): Promise<AudioBuffer> {
    if (decodeShouldFail) {
      return Promise.reject(new Error('decode error'));
    }
    return Promise.resolve(mockAudioBuffer);
  }
}

(global as unknown as { OfflineAudioContext: typeof MockOfflineAudioContext }).OfflineAudioContext =
  MockOfflineAudioContext;

describe('FE-LIB custom-sound-buffers', () => {
  describe('FE-LIB-09 custom-sound-buffers.collectSoundIds(snapshot)', () => {
    it('UTCID01 returns empty array when tracks list is empty', () => {
      expect(collectSoundIds({ tracks: [] })).toEqual([]);
    });

    it('UTCID02 returns empty array when a track has undefined soundMap', () => {
      expect(
        collectSoundIds({
          tracks: [{ soundMap: undefined } as unknown as { soundMap: Record<number, string> }],
        }),
      ).toEqual([]);
    });

    it('UTCID03 de-duplicates sound ids referenced across multiple tracks', () => {
      expect(
        collectSoundIds({
          tracks: [
            { soundMap: { 60: 's1' } },
            { soundMap: { 62: 's1', 64: 's2' } },
          ] as unknown as { soundMap: Record<number, string> }[],
        }),
      ).toEqual(['s1', 's2']);
    });

    it('UTCID04 sorts the collected sound ids lexicographically', () => {
      expect(
        collectSoundIds({
          tracks: [
            { soundMap: { 60: 'z', 61: 'a' } },
          ] as unknown as { soundMap: Record<number, string> }[],
        }),
      ).toEqual(['a', 'z']);
    });
  });

  describe('FE-LIB-10 custom-sound-buffers.loadCustomSoundBuffers(sounds)', () => {
    beforeEach(() => {
      decodeShouldFail = false;
      vi.restoreAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('UTCID01 fetches, decodes and caches playable sound', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as Response);

      const map = await loadCustomSoundBuffers([
        {
          id: 'sound-utcid01',
          name: 'Sound 1',
          playable: true,
          playbackUrl: 'http://cdn/sound1.wav',
          reason: null,
        },
      ]);

      expect(fetchSpy).toHaveBeenCalledWith('http://cdn/sound1.wav');
      expect(map.get('sound-utcid01')).toBe(mockAudioBuffer);
    });

    it('UTCID02 does not fetch when sound is not playable', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      const map = await loadCustomSoundBuffers([
        {
          id: 'sound-utcid02',
          name: 'Deleted Sound',
          playable: false,
          playbackUrl: 'http://cdn/sound2.wav',
          reason: 'deleted',
        },
      ]);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(map.size).toBe(0);
    });

    it('UTCID03 does not fetch when playbackUrl is null', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      const map = await loadCustomSoundBuffers([
        {
          id: 'sound-utcid03',
          name: 'No URL Sound',
          playable: true,
          playbackUrl: null,
          reason: null,
        },
      ]);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(map.size).toBe(0);
    });

    it('UTCID04 returns empty map without fetching when sounds is empty', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      const map = await loadCustomSoundBuffers([]);

      expect(fetchSpy).not.toHaveBeenCalled();
      expect(map.size).toBe(0);
    });

    it('UTCID05 reuses cached buffer without fetching again', async () => {
      const sound = {
        id: 'sound-utcid05',
        name: 'Cached Sound',
        playable: true,
        playbackUrl: 'http://cdn/cached.wav',
        reason: null,
      };

      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as Response);

      // First call: fetches and populates bufferCache
      const map1 = await loadCustomSoundBuffers([sound]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(map1.get('sound-utcid05')).toBe(mockAudioBuffer);

      // Second call: should hit bufferCache and not call fetch
      fetchSpy.mockClear();
      const map2 = await loadCustomSoundBuffers([sound]);
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(map2.get('sound-utcid05')).toBe(mockAudioBuffer);
    });

    it('UTCID06 logs warning and evicts from cache on HTTP 404', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 404,
      } as Response);

      const map = await loadCustomSoundBuffers([
        {
          id: 'sound-utcid06',
          name: 'Missing Sound',
          playable: true,
          playbackUrl: 'http://cdn/missing.wav',
          reason: null,
        },
      ]);

      expect(map.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to load custom sound sound-utcid06:',
        expect.any(Error),
      );
    });

    it('UTCID07 logs warning and evicts from cache when audio decoding fails', async () => {
      decodeShouldFail = true;
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as Response);

      const map = await loadCustomSoundBuffers([
        {
          id: 'sound-utcid07',
          name: 'Corrupted Sound',
          playable: true,
          playbackUrl: 'http://cdn/corrupted.wav',
          reason: null,
        },
      ]);

      expect(map.size).toBe(0);
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to load custom sound sound-utcid07:',
        expect.any(Error),
      );
    });

    it('UTCID08 loads successful sound and logs warning for sound with HTTP 500', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(global, 'fetch').mockImplementation(async (url: RequestInfo | URL) => {
        if (String(url).includes('ok.wav')) {
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => new ArrayBuffer(8),
          } as Response;
        }
        return {
          ok: false,
          status: 500,
        } as Response;
      });

      const map = await loadCustomSoundBuffers([
        {
          id: 'sound-ok',
          name: 'Good Sound',
          playable: true,
          playbackUrl: 'http://cdn/ok.wav',
          reason: null,
        },
        {
          id: 'sound-fail',
          name: 'Bad Sound',
          playable: true,
          playbackUrl: 'http://cdn/fail.wav',
          reason: null,
        },
      ]);

      expect(map.size).toBe(1);
      expect(map.get('sound-ok')).toBe(mockAudioBuffer);
      expect(warnSpy).toHaveBeenCalledWith(
        'Failed to load custom sound sound-fail:',
        expect.any(Error),
      );
    });
  });

  describe('FE-LIB-11 custom-sound-buffers.resolveAndLoadCustomSounds(projectId, snapshot)', () => {
    beforeEach(() => {
      decodeShouldFail = false;
      vi.restoreAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('UTCID01 returns empty map without calling API when snapshot has no custom sounds', async () => {
      const resolveSpy = vi.spyOn(apiClient, 'resolveProjectCustomSounds');

      const map = await resolveAndLoadCustomSounds('project-1', {
        tracks: [
          { soundMap: {} } as unknown as { soundMap: Record<number, string> },
        ] as never,
      });

      expect(map.size).toBe(0);
      expect(resolveSpy).not.toHaveBeenCalled();
    });

    it('UTCID02 resolves playable sound and returns map with AudioBuffer', async () => {
      vi.spyOn(apiClient, 'resolveProjectCustomSounds').mockResolvedValue([
        {
          id: 'sound-rl-02',
          name: 'Kick',
          playable: true,
          playbackUrl: 'http://cdn/rl02.wav',
          reason: null,
        },
      ]);
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => new ArrayBuffer(8),
      } as Response);

      const map = await resolveAndLoadCustomSounds('project-1', {
        tracks: [
          { soundMap: { 60: 'sound-rl-02' } } as unknown as { soundMap: Record<number, string> },
        ] as never,
      });

      expect(map.size).toBe(1);
      expect(map.get('sound-rl-02')).toBe(mockAudioBuffer);
    });

    it('UTCID03 returns empty map when resolved sound is not playable', async () => {
      vi.spyOn(apiClient, 'resolveProjectCustomSounds').mockResolvedValue([
        {
          id: 'sound-rl-03',
          name: 'Deleted',
          playable: false,
          playbackUrl: null,
          reason: 'deleted',
        },
      ]);

      const map = await resolveAndLoadCustomSounds('project-1', {
        tracks: [
          { soundMap: { 60: 'sound-rl-03' } } as unknown as { soundMap: Record<number, string> },
        ] as never,
      });

      expect(map.size).toBe(0);
    });

    it('UTCID04 propagates ApiError 403 when resolve API fails', async () => {
      vi.spyOn(apiClient, 'resolveProjectCustomSounds').mockRejectedValue(
        new apiClient.ApiError(403, 'You do not have access to this project'),
      );

      await expect(
        resolveAndLoadCustomSounds('project-1', {
          tracks: [
            { soundMap: { 60: 'sound-rl-04' } } as unknown as { soundMap: Record<number, string> },
          ] as never,
        }),
      ).rejects.toMatchObject({
        status: 403,
        message: 'You do not have access to this project',
      });
    });
  });
});

/* ─────────────────────────────────────────────────────────────
 * Bổ sung — Haidnde180202 (Report 5). Đánh số UTCID nối tiếp các ca
 * trinv317 đã có ở trên để không trùng mã trong Report5_Unit Test.xlsx.
 * ───────────────────────────────────────────────────────────── */
describe('FE-LIB custom-sound-buffers (bổ sung Haidnde180202)', () => {
  const okResponse = () =>
    ({ ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(8) }) as Response;
  const sound = (id: string, extra: Partial<apiClient.ResolvedCustomSound> = {}): apiClient.ResolvedCustomSound => ({
    id,
    name: id,
    playable: true,
    playbackUrl: `http://cdn/${id}.wav`,
    reason: null,
    ...extra,
  });
  const tracks = (...maps: (Record<string, string> | undefined)[]) =>
    ({ tracks: maps.map((soundMap) => ({ soundMap })) }) as never;

  beforeEach(() => {
    decodeShouldFail = false;
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('FE-LIB-09 collectSoundIds', () => {
    it('FE-LIB-09 UTCID05 (N): collects ids mapped on several pitches of one track', () => {
      expect(collectSoundIds(tracks({ '36': 'kick', '38': 'snare', '42': 'hat' }))).toEqual(['hat', 'kick', 'snare']);
    });

    it('FE-LIB-09 UTCID06 (B): empty soundMap object → empty array', () => {
      expect(collectSoundIds(tracks({}))).toEqual([]);
    });

    it('FE-LIB-09 UTCID07 (B): one id mapped on many pitches → returned once', () => {
      expect(collectSoundIds(tracks({ '36': 'x', '37': 'x', '38': 'x' }, { '60': 'x' }))).toEqual(['x']);
    });

    it('FE-LIB-09 UTCID08 (A): input snapshot is not mutated', () => {
      const s = tracks({ '36': 'b', '37': 'a' }, undefined);
      const before = JSON.stringify(s);
      collectSoundIds(s);
      expect(JSON.stringify(s)).toBe(before);
    });
  });

  describe('FE-LIB-10 loadCustomSoundBuffers', () => {
    it('FE-LIB-10 UTCID09 (N): several playable sounds → all decoded into the map', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => okResponse());
      const map = await loadCustomSoundBuffers([sound('h-10-09-a'), sound('h-10-09-b'), sound('h-10-09-c')]);
      expect([...map.keys()].sort()).toEqual(['h-10-09-a', 'h-10-09-b', 'h-10-09-c']);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });

    it('FE-LIB-10 UTCID10 (A): two concurrent loads of the same id share ONE in-flight fetch', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(async () => okResponse());
      const [m1, m2] = await Promise.all([
        loadCustomSoundBuffers([sound('h-10-10')]),
        loadCustomSoundBuffers([sound('h-10-10')]),
      ]);
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(m1.get('h-10-10')).toBe(m2.get('h-10-10'));
    });

    it('FE-LIB-10 UTCID11 (A): after a failed load the cache is cleared, so the next call retries and succeeds', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValueOnce({ ok: false, status: 503 } as Response)
        .mockResolvedValueOnce(okResponse());
      expect((await loadCustomSoundBuffers([sound('h-10-11')])).size).toBe(0);
      const retry = await loadCustomSoundBuffers([sound('h-10-11')]);
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(retry.get('h-10-11')).toBe(mockAudioBuffer);
    });

    it('FE-LIB-10 UTCID12 (A): network error (fetch rejects) → warning logged, resolves with empty map', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      vi.spyOn(global, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
      const map = await loadCustomSoundBuffers([sound('h-10-12')]);
      expect(map.size).toBe(0);
      expect(warn).toHaveBeenCalledWith('Failed to load custom sound h-10-12:', expect.any(TypeError));
    });

    it('FE-LIB-10 UTCID13 (B): accepts any Iterable (Set / Map.values()) as input', async () => {
      vi.spyOn(global, 'fetch').mockImplementation(async () => okResponse());
      const source = new Map([['k', sound('h-10-13')]]);
      const map = await loadCustomSoundBuffers(source.values());
      expect(map.has('h-10-13')).toBe(true);
    });

    it('FE-LIB-10 UTCID14 (B): playable=true but empty-string playbackUrl → skipped, no fetch', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');
      const map = await loadCustomSoundBuffers([sound('h-10-14', { playbackUrl: '' })]);
      expect(map.size).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe('FE-LIB-11 resolveAndLoadCustomSounds', () => {
    it('FE-LIB-11 UTCID05 (N): calls the API once with projectId and the sorted, de-duplicated ids', async () => {
      const resolveSpy = vi.spyOn(apiClient, 'resolveProjectCustomSounds').mockResolvedValue([]);
      await resolveAndLoadCustomSounds('project-9', tracks({ '36': 'zz', '38': 'aa' }, { '40': 'zz' }));
      expect(resolveSpy).toHaveBeenCalledTimes(1);
      expect(resolveSpy).toHaveBeenCalledWith('project-9', ['aa', 'zz']);
    });

    it('FE-LIB-11 UTCID06 (N): mix of playable and missing sounds → only playable ones in the map', async () => {
      vi.spyOn(apiClient, 'resolveProjectCustomSounds').mockResolvedValue([
        sound('h-11-06-ok'),
        sound('h-11-06-missing', { playable: false, playbackUrl: null, reason: 'missing' }),
      ]);
      vi.spyOn(global, 'fetch').mockImplementation(async () => okResponse());
      const map = await resolveAndLoadCustomSounds('p', tracks({ '36': 'h-11-06-ok', '38': 'h-11-06-missing' }));
      expect([...map.keys()]).toEqual(['h-11-06-ok']);
    });

    it('FE-LIB-11 UTCID07 (A): API returns an empty list → empty map, no fetch', async () => {
      vi.spyOn(apiClient, 'resolveProjectCustomSounds').mockResolvedValue([]);
      const fetchSpy = vi.spyOn(global, 'fetch');
      const map = await resolveAndLoadCustomSounds('p', tracks({ '36': 'gone' }));
      expect(map.size).toBe(0);
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('FE-LIB-11 UTCID08 (A): resolved sound whose file fails to decode → resolves with empty map (no throw)', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      decodeShouldFail = true;
      vi.spyOn(apiClient, 'resolveProjectCustomSounds').mockResolvedValue([sound('h-11-08')]);
      vi.spyOn(global, 'fetch').mockImplementation(async () => okResponse());
      await expect(resolveAndLoadCustomSounds('p', tracks({ '36': 'h-11-08' }))).resolves.toEqual(new Map());
    });
  });
});
