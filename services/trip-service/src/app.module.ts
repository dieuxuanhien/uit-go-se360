import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { FareModule } from './fare/fare.module';
import { TripsModule } from './trips/trips.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RatingsModule } from './ratings/ratings.module';
import { TripEventsModule } from './trip-events/trip-events.module';
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
    NotificationsModule,
    RatingsModule,
    TripEventsModule, // Story 2.1: SQS consumer for trip status updates
  ],
})
export class AppModule {}
