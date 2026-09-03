import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { RegisterSessionDto } from './dto/register-session.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @UseGuards(JwtAuthGuard)
  @Post('sync-profile')
  syncProfile(@Req() req: AuthenticatedRequest) {
    return this.authService.syncProfile(req.user);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sessions')
  registerSession(
    @Req() req: AuthenticatedRequest,
    @Body() dto: RegisterSessionDto,
  ) {
    return this.authService.registerSession(
      req.user.id,
      req.accessToken,
      req,
      dto.deviceLabel,
    );
  }

  @UseGuards(JwtAuthGuard, SessionAuthGuard)
  @Get('sessions')
  listSessions(@Req() req: AuthenticatedRequest) {
    return this.authService.listSessions(req.user.id, req.sessionId!);
  }

  @UseGuards(JwtAuthGuard, SessionAuthGuard)
  @Delete('sessions/:id')
  async revokeSession(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    await this.authService.revokeSession(req.user.id, id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard, SessionAuthGuard)
  @Post('sessions/revoke-others')
  async revokeOthers(@Req() req: AuthenticatedRequest) {
    await this.authService.revokeOtherSessions(
      req.user.id,
      req.accessToken,
      req.sessionId!,
    );
    return { success: true };
  }

  @UseGuards(JwtAuthGuard, SessionAuthGuard)
  @Post('change-password')
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    await this.authService.changePassword(
      req.user.id,
      req.user.email ?? '',
      dto.currentPassword,
      dto.newPassword,
      req.accessToken,
      req.sessionId!,
    );
    return { success: true };
  }

  @UseGuards(JwtAuthGuard, SessionAuthGuard)
  @Delete('account')
  async deleteAccount(
    @Req() req: AuthenticatedRequest,
    @Body() dto: DeleteAccountDto,
  ) {
    await this.authService.deleteAccount(
      req.user.id,
      req.user.email ?? '',
      dto.password,
    );
    return { success: true };
  }
}
