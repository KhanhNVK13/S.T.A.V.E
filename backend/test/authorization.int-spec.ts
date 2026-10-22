import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { asUser, createProject } from './support/test-api';
import { createTestApp } from './support/test-app';
import {
  cleanupTestUsers,
  createTestUser,
  type TestUser,
} from './support/test-users';

describe('Authorization (integration)', () => {
  let app: INestApplication;
  let userA: TestUser;
  let userC: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    userA = await createTestUser(app);
    userC = await createTestUser(app);
    admin = await createTestUser(app, { admin: true });
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await app.close();
  });

  it('AUTH-102 refuses every request of an account suspended by an admin', async () => {
    const userB = await createTestUser(app);
    await createProject(app, userB, 'Own project');
    await asUser(app, admin)
      .post(`/admin/users/${userB.id}/suspend`)
      .send({ reason: 'Integration test suspension' })
      .expect(201);

    const own = await asUser(app, userB).get('/projects');
    const profile = await asUser(app, userB).get('/users/me');

    expect(own.status).toBe(401);
    expect(profile.status).toBe(401);
    expect(JSON.stringify(own.body)).not.toContain('Own project');
  });

  it('AUTH-103 answers a private project and a missing project in the same way', async () => {
    const project = await createProject(app, userA, 'Private song');
    const forbidden = await asUser(app, userC).get(`/projects/${project.id}`);
    const missing = await asUser(app, userC).get(
      '/projects/3f2b8a1c-9d4e-4a6b-8c1d-5e7f90a1b2c3',
    );

    expect(forbidden.status).toBeGreaterThanOrEqual(400);
    expect(missing.status).toBe(forbidden.status);
    expect(missing.body).toEqual(forbidden.body);
    expect(JSON.stringify(forbidden.body)).not.toContain('Private song');
  });

  it('API-ADMIN-01 refuses a non-admin on the admin user endpoint', async () => {
    await asUser(app, userA).get('/admin/users').expect(403);
    await request(app.getHttpServer()).get('/admin/users').expect(401);
  });
});
