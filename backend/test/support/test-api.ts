import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { TestUser } from './test-users';

export function asUser(app: INestApplication, user: TestUser) {
  const server = app.getHttpServer();
  const set = (req: request.Test) => req.set(user.headers);
  return {
    get: (path: string) => set(request(server).get(path)),
    post: (path: string) => set(request(server).post(path)),
    put: (path: string) => set(request(server).put(path)),
    patch: (path: string) => set(request(server).patch(path)),
    delete: (path: string) => set(request(server).delete(path)),
  };
}

export async function createProject(
  app: INestApplication,
  user: TestUser,
  name = 'Integration project',
): Promise<{ id: string; name: string }> {
  const response = await asUser(app, user)
    .post('/projects')
    .send({ name })
    .expect(201);
  return response.body as { id: string; name: string };
}
