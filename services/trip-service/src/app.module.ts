import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { FareModule } from './fare/fare.module';
import { TripsModule } from './trips/trips.module';
import { validationSchema } from './config/validation.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validationSchema,
    }),
    PrismaModule,
    HealthModule,
    FareModule,
    TripsModule,
  ],
})
export class AppModule {}
