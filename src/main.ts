/* eslint-disable @typescript-eslint/no-floating-promises */
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // remove unknown fields
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  // app.enableCors({
  //   origin: 'http://localhost:5173', // Vite frontend
  //   credentials: true,
  // });

  app.enableCors({
    origin: '*', // frontend
    credentials: true,
  });

  // Serve uploaded files from the same root used by file writes (process.cwd()/uploads)
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  const port = process.env.PORT || 3000;

  await app.listen(port);
}
bootstrap();
