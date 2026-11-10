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
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import { BillingHistoryService } from './billing-history.service';
import {
  CreatePaymentIssueDto,
  ListTransactionsQueryDto,
} from './dto/billing-history.dto';

/** UC-77 — lịch sử giao dịch, biên lai và báo sự cố của chính người gọi. */
@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('billing/transactions')
export class BillingController {
  constructor(private readonly history: BillingHistoryService) {}

  @Get()
  list(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.history.listTransactions(
      req.user.id,
      query.limit,
      query.cursor,
    );
  }

  @Get(':id/receipt')
  receipt(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.history.getReceipt(req.user.id, id);
  }

  @UseGuards(UserThrottlerGuard)
  @Post(':id/issues')
  reportIssue(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreatePaymentIssueDto,
  ) {
    return this.history.reportIssue(req.user.id, id, dto.description);
  }
}
