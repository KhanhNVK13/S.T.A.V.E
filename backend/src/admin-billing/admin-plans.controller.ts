import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { AdminPlansService } from './admin-plans.service';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanPriceDto } from './dto/update-plan-price.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/plans')
export class AdminPlansController {
  constructor(private readonly service: AdminPlansService) {}

  @Get()
  list() {
    return this.service.listPlans();
  }

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreatePlanDto) {
    return this.service.createPlan(req.user.id, dto);
  }

  @Patch(':id/price')
  changePrice(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePlanPriceDto,
  ) {
    return this.service.changePrice(req.user.id, id, dto);
  }

  @Post(':id/deactivate')
  deactivate(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setActive(req.user.id, id, false);
  }

  @Post(':id/activate')
  activate(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.setActive(req.user.id, id, true);
  }
}
