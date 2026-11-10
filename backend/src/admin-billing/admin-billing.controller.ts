import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { AdminBillingService } from './admin-billing.service';
import { AdminTransactionsQueryDto } from './dto/admin-transactions-query.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard, AdminGuard)
@Controller('admin/transactions')
export class AdminBillingController {
  constructor(private readonly service: AdminBillingService) {}

  @Get()
  list(@Query() query: AdminTransactionsQueryDto) {
    return this.service.listTransactions(query);
  }

  @Get(':id')
  detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getTransaction(id);
  }
}
