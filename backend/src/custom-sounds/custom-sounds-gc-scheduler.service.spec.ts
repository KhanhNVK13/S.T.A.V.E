import type { CustomSoundsService } from './custom-sounds.service';
import {
  CustomSoundsGcSchedulerService,
  DEFAULT_GC_INTERVAL_MS,
  GC_START_DELAY_MS,
  resolveGcIntervalMs,
} from './custom-sounds-gc-scheduler.service';

function make(collect: jest.Mock) {
  return new CustomSoundsGcSchedulerService({
    collectGarbage: collect,
  } as unknown as CustomSoundsService);
}

describe('CustomSoundsGcSchedulerService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.useRealTimers();
  });

  it('run() calls collectGarbage', async () => {
    const collect = jest.fn().mockResolvedValue(undefined);
    await make(collect).run();
    expect(collect).toHaveBeenCalledTimes(1);
  });

  it('run() swallows errors so the process keeps running', async () => {
    const collect = jest.fn().mockRejectedValue(new Error('storage down'));
    await expect(make(collect).run()).resolves.toBeUndefined();
  });

  it('run() does not overlap with a run still in progress', async () => {
    let release: () => void = () => undefined;
    const collect = jest.fn(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const service = make(collect);
    const first = service.run();
    await service.run();
    expect(collect).toHaveBeenCalledTimes(1);
    release();
    await first;
  });

  it('does not start when NODE_ENV is test', () => {
    process.env.NODE_ENV = 'test';
    const collect = jest.fn().mockResolvedValue(undefined);
    const service = make(collect);
    service.onModuleInit();
    expect(collect).not.toHaveBeenCalled();
    service.onModuleDestroy();
  });

  it('does not start when CUSTOM_SOUND_GC_ENABLED is false', () => {
    process.env.NODE_ENV = 'production';
    process.env.CUSTOM_SOUND_GC_ENABLED = 'false';
    const collect = jest.fn().mockResolvedValue(undefined);
    const service = make(collect);
    service.onModuleInit();
    expect(collect).not.toHaveBeenCalled();
  });

  it('waits before the first run, then runs on every interval', async () => {
    jest.useFakeTimers();
    process.env.NODE_ENV = 'production';
    process.env.CUSTOM_SOUND_GC_INTERVAL_MS = '300000';
    const collect = jest.fn().mockResolvedValue(undefined);
    const service = make(collect);
    service.onModuleInit();
    expect(collect).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(GC_START_DELAY_MS);
    expect(collect).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(300000);
    expect(collect).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(600000);
    expect(collect).toHaveBeenCalledTimes(2);
  });

  it('resolveGcIntervalMs falls back for missing, invalid or too small values', () => {
    expect(resolveGcIntervalMs(undefined)).toBe(DEFAULT_GC_INTERVAL_MS);
    expect(resolveGcIntervalMs('abc')).toBe(DEFAULT_GC_INTERVAL_MS);
    expect(resolveGcIntervalMs('1000')).toBe(DEFAULT_GC_INTERVAL_MS);
    expect(resolveGcIntervalMs('300000')).toBe(300000);
  });
});
