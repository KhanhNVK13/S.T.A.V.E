import {
  Body,
  Controller,
  Get,
  Patch,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetThemeDto } from './dto/set-theme.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  getMe(@Req() req: AuthenticatedRequest) {
    return this.usersService.getProfile(req.user.id);
  }

  @Patch('me')
  updateMe(@Req() req: AuthenticatedRequest, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(req.user.id, dto);
  }

  /** UC-78: theme đang áp dụng (null = chưa chọn, dùng preset mặc định). */
  @Get('me/theme')
  getMyTheme(@Req() req: AuthenticatedRequest) {
    return this.usersService.getActiveTheme(req.user.id);
  }

  /** UC-78: chọn preset theme — miễn phí cho mọi gói (BR-83). */
  @Put('me/theme')
  setMyTheme(@Req() req: AuthenticatedRequest, @Body() dto: SetThemeDto) {
    return this.usersService.setPresetTheme(req.user.id, dto.presetKey);
  }
}
