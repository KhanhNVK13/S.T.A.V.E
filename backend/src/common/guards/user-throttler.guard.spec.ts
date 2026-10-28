import {
  Controller,
  Injectable,
  Post,
  UseGuards,
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Throttle, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import type { App } from 'supertest/types';
import { UserThrottlerGuard } from './user-throttler.guard';

@Injectable()
class FakeAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context
      .switchToHttp()
      .getRequest<{ headers: Record<string, string>; user?: { id: string } }>();
    req.user = { id: req.headers['x-user'] };
    return true;
  }
}

@UseGuards(FakeAuthGuard)
@Controller()
class LimitedController {
  @UseGuards(UserThrottlerGuard)
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @Post('limited')
  limited() {
    return { ok: true };
  }
}

describe('UserThrottlerGuard', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
          errorMessage: 'Too many requests, please try again later',
        }),
      ],
      controllers: [LimitedController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('counts each account separately and answers 429 past the limit', async () => {
    const server = app.getHttpServer();
    const send = (user: string) =>
      request(server).post('/limited').set('x-user', user);

    expect((await send('a')).status).toBe(201);
    expect((await send('a')).status).toBe(201);
    const third = await send('a');
    expect(third.status).toBe(429);
    expect((third.body as { message: string }).message).toBe(
      'Too many requests, please try again later',
    );
    expect((await send('b')).status).toBe(201);
  });
});
