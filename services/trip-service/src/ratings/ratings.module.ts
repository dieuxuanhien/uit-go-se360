import { Module } from '@nestjs/common';
import { RatingsController } from './ratings.controller';
import { RatingsService } from './ratings.service';
import { RatingsRepository } from './ratings.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { TripsModule } from '../trips/trips.module';

/**
 * Ratings Module
 * Encapsulates rating-related functionality
 */
@Module({
  imports: [PrismaModule, TripsModule],
  controllers: [RatingsController],
  providers: [RatingsService, RatingsRepository],
  exports: [RatingsService, RatingsRepository],
})
export class RatingsModule {}
