import { Controller, Get, Param, Query } from '@nestjs/common';
import { ExploreService } from './explore.service';
import { PublicProjectsQueryDto } from '../projects/dto/public-projects-query.dto';

@Controller('explore')
export class ExploreController {
  constructor(private readonly exploreService: ExploreService) {}

  /** UC-08: Browse Explore page — list public projects with filters. */
  @Get('projects')
  listPublicProjects(@Query() query: PublicProjectsQueryDto) {
    return this.exploreService.listPublicProjects(query);
  }

  /** UC-09: View public project detail — 404 for private projects. */
  @Get('projects/:id')
  getPublicProject(@Param('id') id: string) {
    return this.exploreService.getPublicProject(id);
  }

  /** UC-10: View public user profile. */
  @Get('users/:id')
  getPublicUserProfile(@Param('id') id: string) {
    return this.exploreService.getPublicUserProfile(id);
  }

  /** UC-10: List public projects of a specific user. */
  @Get('users/:id/projects')
  getUserPublicProjects(@Param('id') id: string) {
    return this.exploreService.getUserPublicProjects(id);
  }

  /** UC-11: View project rankings — sorted by play_count. */
  @Get('rankings')
  getRankings() {
    return this.exploreService.getRankings();
  }

  /** UC-12: Featured content for landing page. */
  @Get('featured')
  getFeatured() {
    return this.exploreService.getFeatured();
  }
}
