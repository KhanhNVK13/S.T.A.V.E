import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { ReactivateUserDto } from './dto/reactivate-user.dto';
import { RemoveUserDto } from './dto/remove-user.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/users')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get()
  listUsers(@Query() query: ListUsersQueryDto) {
    return this.adminService.listUsers(query);
  }

  @Post(':id/suspend')
  async suspend(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
  ) {
    await this.adminService.suspendUser(req.user.id, id, dto.reason);
    return { success: true };
  }

  @Post(':id/reactivate')
  async reactivate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ReactivateUserDto,
  ) {
    await this.adminService.reactivateUser(req.user.id, id, dto.reason);
    return { success: true };
  }

  @Delete(':id')
  async remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: RemoveUserDto,
  ) {
    await this.adminService.removeUser(
      req.user.id,
      id,
      dto.reason,
      dto.confirmUsername,
    );
    return { success: true };
  }
}
