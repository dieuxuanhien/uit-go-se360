import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * Bootstrap the User Service application.
 * Initializes NestJS application with global pipes, filters, and middleware.
 * Listens on the configured port (default: 3001).
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable global validation pipe for DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Apply global HTTP exception filter for consistent error handling
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.USER_SERVICE_PORT ?? 3001;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`User Service is running on port ${port}`);
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap User Service:', error);
  process.exit(1);
});
