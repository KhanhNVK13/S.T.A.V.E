import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserThrottlerGuard } from '../common/guards/user-throttler.guard';
import {
  PublicCommitsQueryDto,
  PublicDiffQueryDto,
} from './dto/public-history-query.dto';
import { PublicHistoryService } from './public-history.service';

const notFoundOnBadId = new ParseUUIDPipe({ errorHttpStatusCode: 404 });

@UseGuards(UserThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('explore/projects/:id')
export class PublicHistoryController {
  constructor(private readonly history: PublicHistoryService) {}

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('preview')
  getPreview(@Param('id', notFoundOnBadId) id: string) {
    return this.history.getPreview(id);
  }

  @Get('branches')
  listBranches(@Param('id', notFoundOnBadId) id: string) {
    return this.history.listBranches(id);
  }

  @Get('commits')
  listCommits(
    @Param('id', notFoundOnBadId) id: string,
    @Query() query: PublicCommitsQueryDto,
  ) {
    return this.history.listCommits(id, query);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('commits/:commitId')
  getCommit(
    @Param('id', notFoundOnBadId) id: string,
    @Param('commitId', notFoundOnBadId) commitId: string,
  ) {
    return this.history.getCommit(id, commitId);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('diff')
  compare(
    @Param('id', notFoundOnBadId) id: string,
    @Query() query: PublicDiffQueryDto,
  ) {
    return this.history.compare(id, query.base, query.target);
  }
}
