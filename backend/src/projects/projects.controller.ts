import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import type { AuthenticatedRequest } from '../common/guards/jwt-auth.guard';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

@UseGuards(JwtAuthGuard, SessionAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateProjectDto) {
    return this.projectsService.create(req.user.id, dto);
  }

  @Get()
  listMine(@Req() req: AuthenticatedRequest) {
    return this.projectsService.listMine(req.user.id);
  }

  @Get(':id')
  getOne(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projectsService.getOwned(id, req.user.id);
  }

  /** UC-19: cập nhật thông tin project. */
  @Patch(':id')
  update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.updateOwned(id, req.user.id, dto);
  }

  /** UC-20: archive project. */
  @Patch(':id/archive')
  archive(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projectsService.archiveOwned(id, req.user.id);
  }

  /** UC-21: xóa project. Chỉ owner mới được xóa. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.projectsService.deleteOwned(id, req.user.id);
  }
}
