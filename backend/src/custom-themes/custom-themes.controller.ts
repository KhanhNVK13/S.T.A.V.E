import { Body, Controller, Get, Put, Req, UseGuards } from '@nestjs/common';
import type { Palette } from '@stave/shared-types';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { CustomThemesService } from './custom-themes.service';
import { PaletteValidationPipe } from './dto/palette-validation.pipe';

/** UC-79 — theme tạo từ ảnh (STAVE+): xem theme có hiệu lực và lưu palette. */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('themes')
export class CustomThemesController {
  constructor(private readonly service: CustomThemesService) {}

  /** Theme có hiệu lực (BR-89: trả cả khi hết hạn, kèm cờ quyền). */
  @Get('me/effective')
  getEffective(@Req() req: AuthenticatedRequest) {
    return this.service.getEffectiveTheme(req.user.id);
  }

  /** Lưu palette custom — đòi quyền trả phí (403 nếu không có). */
  @UseGuards(UserThrottlerGuard)
  @Put('me/custom')
  saveCustom(
    @Req() req: AuthenticatedRequest,
    @Body(new PaletteValidationPipe()) body: { palette: Palette },
  ) {
    return this.service.saveCustomTheme(req.user.id, body.palette);
  }

  /** Dùng lại palette từ ảnh đã lưu — đòi quyền trả phí, 404 nếu chưa lưu. */
  @UseGuards(UserThrottlerGuard)
  @Put('me/custom/activate')
  activateCustom(@Req() req: AuthenticatedRequest) {
    return this.service.activateSavedCustomTheme(req.user.id);
  }
}
