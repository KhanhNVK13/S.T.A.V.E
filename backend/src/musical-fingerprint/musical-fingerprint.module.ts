import { Module } from '@nestjs/common';
import { MusicalFingerprintService } from './musical-fingerprint.service';

@Module({
  providers: [MusicalFingerprintService],
  exports: [MusicalFingerprintService],
})
export class MusicalFingerprintModule {}
