import {
  CanActivate,
  ExecutionContext,
  Injectable,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AuthController } from '../../auth/auth.controller';
import { AuthService } from '../../auth/auth.service';
import { AudioSketchesController } from '../../audio-sketches/audio-sketches.controller';
import { AudioSketchesService } from '../../audio-sketches/audio-sketches.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { SessionAuthGuard } from './session-auth.guard';

@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
      user?: { id: string; email: string };
      accessToken?: string;
      sessionId?: string;
    }>();
    req.user = { id: req.headers['x-user'], email: 'u@example.com' };
    req.accessToken = 'token';
    req.sessionId = 'sid';
    return true;
  }
}

const PROJECT_ID = '3f0c6f1e-6a3c-4a53-9c1f-0d6f5d1a2b3c';

describe('per-user throttling on sensitive endpoints', () => {
  let app: INestApplication<App>;
  const authService = {
    changePassword: jest.fn().mockResolvedValue(undefined),
    deleteAccount: jest.fn().mockResolvedValue(undefined),
  };
  const sketchService = {
    createUploadUrl: jest.fn().mockResolvedValue({ id: 'x' }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: 1000 }],
          errorMessage: 'Too many requests, please try again later',
        }),
      ],
      controllers: [AuthController, AudioSketchesController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: AudioSketchesService, useValue: sketchService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(FakeAuthGuard)
      .overrideGuard(SessionAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const statuses = async (
    send: (user: string) => request.Test,
    user: string,
    count: number,
  ) => {
    const out: number[] = [];
    for (let i = 0; i < count; i++) out.push((await send(user)).status);
    return out;
  };

  const changePassword = (user: string) =>
    request(app.getHttpServer())
      .post('/auth/change-password')
      .set('x-user', user)
      .send({ currentPassword: 'Old-pass-1', newPassword: 'New-pass-1' });

  const deleteAccount = (user: string) =>
    request(app.getHttpServer())
      .delete('/auth/account')
      .set('x-user', user)
      .send({ password: 'Old-pass-1' });

  const uploadUrl = (user: string) =>
    request(app.getHttpServer())
      .post(`/projects/${PROJECT_ID}/audio-sketches/upload-url`)
      .set('x-user', user)
      .send({});

  it('change-password: 5 calls pass, the 6th is 429, another user is unaffected', async () => {
    expect(await statuses(changePassword, 'a', 6)).toEqual([
      201, 201, 201, 201, 201, 429,
    ]);
    expect(authService.changePassword).toHaveBeenCalledTimes(5);
    expect((await changePassword('b')).status).toBe(201);
  });

  it('DELETE /auth/account: 5 calls pass, the 6th is 429', async () => {
    expect(await statuses(deleteAccount, 'a', 6)).toEqual([
      200, 200, 200, 200, 200, 429,
    ]);
    expect(authService.deleteAccount).toHaveBeenCalledTimes(5);
    expect((await deleteAccount('b')).status).toBe(200);
  });

  it('audio sketch upload-url: 20 calls pass, the 21st is 429', async () => {
    const result = await statuses(uploadUrl, 'a', 21);
    expect(result.slice(0, 20).every((s) => s === 201)).toBe(true);
    expect(result[20]).toBe(429);
    expect(sketchService.createUploadUrl).toHaveBeenCalledTimes(20);
    expect((await uploadUrl('b')).status).toBe(201);
  });
});
