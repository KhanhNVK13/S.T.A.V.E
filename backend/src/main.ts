import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({ origin: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Express's default json body-parser limit is 100kb — a MIDI-imported
  // project's draft/commit snapshot (notes[] can run into the thousands)
  // routinely exceeds that on PUT /projects/:id/draft and POST /commits'
  // draft flush, failing with a 413 before reaching any business logic.
  app.useBodyParser('json', { limit: '25mb' });
  await app.listen(process.env.PORT ?? 3001);
}
void bootstrap();
