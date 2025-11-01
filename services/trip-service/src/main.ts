import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

/**
 * Bootstrap the Trip Service application.
 * Initializes NestJS application with global pipes, filters, and middleware.
 * Listens on the configured port (default: 3002).
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

  // Setup Swagger
  const config = new DocumentBuilder()
    .setTitle('Trip Service API')
    .setDescription('API documentation for the Trip Service')
    .setVersion('1.0')
    .addTag('Trips')
    .addTag('Health')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3002;
  await app.listen(port, '0.0.0.0');
  // eslint-disable-next-line no-console
  console.log(`Trip Service is running on port ${port}`);
  // eslint-disable-next-line no-console
  console.log(
    `Swagger documentation available at http://localhost:${port}/api`,
  );
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Failed to bootstrap Trip Service:', error);
  process.exit(1);
});
