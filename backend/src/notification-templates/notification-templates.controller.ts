import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import type {
  NotificationTemplateInfo,
  NotificationTemplatePreview,
} from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { NotificationTemplatesService } from './notification-templates.service';
import { PreviewTemplateDto, SaveTemplateDto } from './dto/template-text.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/notification-templates')
export class NotificationTemplatesController {
  constructor(private readonly service: NotificationTemplatesService) {}

  @Get()
  list(): Promise<NotificationTemplateInfo[]> {
    return this.service.list();
  }

  @Post('preview')
  @HttpCode(200)
  preview(@Body() dto: PreviewTemplateDto): NotificationTemplatePreview {
    return this.service.preview(dto);
  }

  @Put(':type')
  save(
    @Req() req: AuthenticatedRequest,
    @Param('type') type: string,
    @Body() dto: SaveTemplateDto,
  ): Promise<{ created: boolean }> {
    return this.service.save(req.user.id, type, dto);
  }

  @Delete(':type')
  @HttpCode(204)
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('type') type: string,
  ): Promise<void> {
    await this.service.remove(req.user.id, type);
  }
}
