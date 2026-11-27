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
import {
  AskProjectService,
  type AskProjectResult,
} from './ask-project.service';
import { AskProjectDto } from './dto/ask-project.dto';

@Controller('ai')
@UseGuards(JwtAuthGuard, SessionAuthGuard)
export class AskProjectController {
  constructor(private readonly askProject: AskProjectService) {}

  @Post('ask-project')
  @HttpCode(HttpStatus.OK)
  async ask(
    @Body() dto: AskProjectDto,
    @CurrentUser() userId: string,
  ): Promise<AskProjectResult> {
    return this.askProject.ask(userId, dto.projectId, dto.question, dto.lang);
  }
}
