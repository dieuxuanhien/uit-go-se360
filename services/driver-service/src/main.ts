import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Enable CORS
  app.enableCors();

  // Setup Swagger
  const config = new DocumentBuilder()
    .setTitle('Driver Service API')
    .setDescription('API documentation for the Driver Service')
    .setVersion('1.0')
    .addTag('Health')
    .addTag('Drivers')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.DRIVER_SERVICE_PORT || 3003;
  await app.listen(port);
  Logger.log(`Driver Service is running on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger documentation available at http://localhost:${port}/api`, 'Bootstrap');
}
bootstrap().catch((error) => {
  Logger.error('Failed to start Driver Service', error.stack, 'Bootstrap');
  process.exit(1);
});
