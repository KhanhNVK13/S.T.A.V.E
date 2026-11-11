import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { CustomSoundsService } from './custom-sounds.service';

export const DEFAULT_GC_INTERVAL_MS = 6 * 60 * 60 * 1000;
export const GC_START_DELAY_MS = 2 * 60 * 1000;
export const MIN_GC_INTERVAL_MS = 60 * 1000;

export function resolveGcIntervalMs(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed < MIN_GC_INTERVAL_MS) {
    return DEFAULT_GC_INTERVAL_MS;
  }
  return Math.floor(parsed);
}

@Injectable()
export class CustomSoundsGcSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(CustomSoundsGcSchedulerService.name);
  private timer?: NodeJS.Timeout;
  private startTimer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly customSounds: CustomSoundsService) {}

  onModuleInit(): void {
    if (this.isDisabled()) return;
    const interval = resolveGcIntervalMs(
      process.env.CUSTOM_SOUND_GC_INTERVAL_MS,
    );
    this.startTimer = setTimeout(() => void this.run(), GC_START_DELAY_MS);
    this.startTimer.unref();
    this.timer = setInterval(() => void this.run(), interval);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.startTimer) clearTimeout(this.startTimer);
  }

  async run(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.customSounds.collectGarbage();
    } catch (err) {
      this.logger.error(
        `Custom sound garbage collection failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private isDisabled(): boolean {
    const flag = process.env.CUSTOM_SOUND_GC_ENABLED;
    if (process.env.NODE_ENV === 'test' || flag === 'false') return true;
    return process.env.NODE_ENV !== 'production' && flag !== 'true';
  }
}
