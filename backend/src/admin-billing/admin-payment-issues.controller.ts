import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { AdminPaymentIssuesService } from './admin-payment-issues.service';
import { AdminPaymentIssuesQueryDto } from './dto/admin-payment-issues-query.dto';
import { ResolvePaymentIssueDto } from './dto/resolve-payment-issue.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/payment-issues')
export class AdminPaymentIssuesController {
  constructor(private readonly service: AdminPaymentIssuesService) {}

  @Get()
  list(@Query() query: AdminPaymentIssuesQueryDto) {
    return this.service.listIssues(
      query.status ?? 'open',
      query.limit,
      query.cursor,
    );
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getIssue(id);
  }

  @Post(':id/resolve')
  resolve(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolvePaymentIssueDto,
  ) {
    return this.service.resolveIssue(req.user.id, id, dto);
  }
}
