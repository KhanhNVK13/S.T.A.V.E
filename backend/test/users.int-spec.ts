import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './support/test-app';
import { asUser } from './support/test-api';
import {
  cleanupTestUsers,
  createTestUser,
  type TestUser,
} from './support/test-users';

describe('Users API (integration)', () => {
  let app: INestApplication;
  let user: TestUser;

  beforeAll(async () => {
    app = await createTestApp();
    user = await createTestUser(app);
  });

  afterAll(async () => {
    await cleanupTestUsers();
    await app.close();
  });

  it('IT-USR-01 rejects a request without a token', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });

  it('IT-USR-02 rejects a valid token without a session id', async () => {
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', user.headers.Authorization)
      .expect(401);
  });

  it('IT-USR-03 returns the signed-in profile', async () => {
    const response = await asUser(app, user).get('/users/me').expect(200);
    expect(response.body).toEqual(
      expect.objectContaining({ id: user.id, email: user.email, role: 'user' }),
    );
  });

  it('IT-USR-04 updates the profile and persists it', async () => {
    await asUser(app, user)
      .patch('/users/me')
      .send({ bio: 'Integration bio' })
      .expect(200);
    const response = await asUser(app, user).get('/users/me').expect(200);
    expect((response.body as { bio: string }).bio).toBe('Integration bio');
  });

  it('IT-USR-05 rejects an invalid username through the validation pipe', async () => {
    await asUser(app, user)
      .patch('/users/me')
      .send({ username: 'Bad-Name' })
      .expect(400);
  });

  it('IT-USR-06 stores a preset theme and reads it back', async () => {
    await asUser(app, user)
      .put('/users/me/theme')
      .send({ presetKey: 'moss' })
      .expect(200);
    const response = await asUser(app, user).get('/users/me/theme').expect(200);
    expect(response.body).toEqual({
      type: 'preset',
      presetKey: 'moss',
      generatedPalette: null,
    });
  });
});
