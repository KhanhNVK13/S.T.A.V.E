import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type {
  PlatformSettingsResponse,
  UpdateSettingsResponse,
} from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PlatformSettingsAdminService } from './platform-settings-admin.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/settings')
export class PlatformSettingsAdminController {
  constructor(private readonly settings: PlatformSettingsAdminService) {}

  @Get()
  getAll(): Promise<PlatformSettingsResponse> {
    return this.settings.getAll();
  }

  @Put()
  update(
    @Req() req: AuthenticatedRequest,
    @Body() dto: UpdateSettingsDto,
  ): Promise<UpdateSettingsResponse> {
    return this.settings.update(req.user.id, dto);
  }
}
