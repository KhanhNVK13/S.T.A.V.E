import { Module } from '@nestjs/common';
import { PlatformSettingsService } from './platform-settings.service';

/**
 * UC-109 (foundation): `PlatformSettingsService` (typed, cached read of
 * `platform_settings`). Declared in the admin module tree for now; UC-109's
 * own controller (and notifications/stats later) import this service via
 * `providers`/`exports` of a dedicated module or directly.
 *
 * Not @Global: keep it explicit so a module must opt in, matching the
 * project's per-feature module style.
 */
@Module({
  providers: [PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
