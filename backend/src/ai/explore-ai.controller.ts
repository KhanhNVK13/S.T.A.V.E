import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { ExploreParseDto } from './dto/explore-parse.dto';
import {
  ExploreSearchService,
  type ExploreSearchResult,
} from './explore-search.service';

@Controller('ai')
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class ExploreAiController {
  constructor(private readonly exploreSearch: ExploreSearchService) {}

  @Post('explore-parse')
  @HttpCode(HttpStatus.OK)
  async parseExploreQuery(
    @Body() dto: ExploreParseDto,
    @CurrentUser() userId: string,
  ): Promise<ExploreSearchResult> {
    return this.exploreSearch.parse(userId, dto.query, dto.lang);
  }
}
