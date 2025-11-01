import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { RatingsRepository } from './ratings.repository';
import { DatabaseModule } from '../database/database.module';
import { TripServiceClient } from '../integrations/trip-service.client';

/**
 * Ratings Module
 * Encapsulates rating-related functionality
 */
@Module({
  imports: [DatabaseModule, HttpModule],
  controllers: [RatingsController],
  providers: [RatingsService, RatingsRepository, TripServiceClient],
  exports: [RatingsService, RatingsRepository],
})
export class RatingsModule {}
