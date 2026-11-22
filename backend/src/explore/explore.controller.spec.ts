import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { ExploreController } from './explore.controller';
import { ExploreService } from './explore.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';

const VALID_UUID = '11111111-2222-4333-8444-555555555555';

describe('ExploreController UUID param validation', () => {
  let app: INestApplication;
  let exploreService: {
    getPublicProject: jest.Mock;
    getPublicProjectGraph: jest.Mock;
    getPublicUserProfile: jest.Mock;
    getUserPublicProjects: jest.Mock;
  };

  beforeEach(async () => {
    exploreService = {
      getPublicProject: jest.fn().mockResolvedValue({ id: VALID_UUID }),
      getPublicProjectGraph: jest.fn().mockResolvedValue({
        branches: [],
        commits: [],
        total: 0,
      }),
      getPublicUserProfile: jest.fn().mockResolvedValue({ id: VALID_UUID }),
      getUserPublicProjects: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ExploreController],
      providers: [{ provide: ExploreService, useValue: exploreService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it.each([
    ['GET /explore/users/:id/projects', `/explore/users/not-a-uuid/projects`],
    ['GET /explore/users/:id', `/explore/users/not-a-uuid`],
    ['GET /explore/projects/:id', `/explore/projects/not-a-uuid`],
    ['GET /explore/projects/:id/graph', `/explore/projects/not-a-uuid/graph`],
  ])('%s returns 404 when :id is not a UUID', async (_label, path) => {
    await request(app.getHttpServer()).get(path).expect(404);
    expect(exploreService.getUserPublicProjects).not.toHaveBeenCalled();
    expect(exploreService.getPublicUserProfile).not.toHaveBeenCalled();
    expect(exploreService.getPublicProject).not.toHaveBeenCalled();
    expect(exploreService.getPublicProjectGraph).not.toHaveBeenCalled();
  });

  it('delegates valid UUIDs to ExploreService', async () => {
    await request(app.getHttpServer())
      .get(`/explore/users/${VALID_UUID}/projects`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/explore/users/${VALID_UUID}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/explore/projects/${VALID_UUID}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/explore/projects/${VALID_UUID}/graph`)
      .expect(200);

    expect(exploreService.getUserPublicProjects).toHaveBeenCalledWith(
      VALID_UUID,
    );
    expect(exploreService.getPublicUserProfile).toHaveBeenCalledWith(
      VALID_UUID,
    );
    expect(exploreService.getPublicProject).toHaveBeenCalledWith(VALID_UUID);
    expect(exploreService.getPublicProjectGraph).toHaveBeenCalledWith(
      VALID_UUID,
    );
  });
});
