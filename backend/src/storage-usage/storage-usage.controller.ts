import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { StorageUsageService } from './storage-usage.service';

@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('users/me/storage')
export class StorageUsageController {
  constructor(private readonly storageUsage: StorageUsageService) {}

  @Get()
  get(@Req() req: AuthenticatedRequest) {
    return this.storageUsage.getForUser(req.user.id);
  }
}
