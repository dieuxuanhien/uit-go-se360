import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Rating } from '@prisma/client';
import { RatingsRepository } from './ratings.repository';
import { TripsRepository } from '../trips/trips.repository';
import { CreateRatingDto } from './dto/create-rating.dto';
import { RatingDto } from './dto/rating.dto';

/**
 * Ratings Service
 * Handles business logic for trip ratings
 */
@Injectable()
export class RatingsService {
  private readonly logger = new Logger(RatingsService.name);

  constructor(
    private readonly ratingsRepository: RatingsRepository,
    private readonly tripsRepository: TripsRepository,
  ) {}

  /**
   * Submit a rating for a completed trip
   * @param tripId Trip ID
   * @param userId User ID (passenger)
   * @param dto Rating data
   * @returns Created rating DTO
   */
  async submitRating(
    tripId: string,
    userId: string,
    dto: CreateRatingDto,
  ): Promise<RatingDto> {
    // 1. Fetch trip
    const trip = await this.tripsRepository.findById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    // 2. Check trip is completed
    if (trip.status !== 'COMPLETED') {
      throw new BadRequestException('Trip must be completed to submit rating');
    }

    // 3. Authorization: verify user is the passenger
    if (trip.passengerId !== userId) {
      throw new ForbiddenException(
        "Only the trip's passenger can submit a rating",
      );
    }

    // 4. Check for existing rating (prevent duplicates)
    const existingRating = await this.ratingsRepository.findByTripId(tripId);
    if (existingRating) {
      throw new ConflictException('Trip has already been rated');
    }

    // 5. Create rating
    const rating = await this.ratingsRepository.create({
      tripId,
      passengerId: trip.passengerId,
      driverId: trip.driverId!,
      stars: dto.stars,
      comment: dto.comment,
    });

    this.logger.log('Rating submitted', {
      ratingId: rating.id,
      tripId,
      stars: dto.stars,
    });

    return this.mapToDto(rating);
  }

  /**
   * Get rating for a trip
   * @param tripId Trip ID
   * @param userId User ID
   * @returns Rating DTO
   */
  async getRating(tripId: string, userId: string): Promise<RatingDto> {
    // 1. Fetch trip
    const trip = await this.tripsRepository.findById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    // 2. Authorization: user must be passenger or driver
    if (trip.passengerId !== userId && trip.driverId !== userId) {
      throw new ForbiddenException(
        'You are not authorized to view this rating',
      );
    }

    // 3. Fetch rating
    const rating = await this.ratingsRepository.findByTripId(tripId);
    if (!rating) {
      throw new NotFoundException('No rating found for this trip');
    }

    return this.mapToDto(rating);
  }

  private mapToDto(rating: Rating): RatingDto {
    return {
      id: rating.id,
      tripId: rating.tripId,
      passengerId: rating.passengerId,
      driverId: rating.driverId,
      stars: rating.stars,
      comment: rating.comment,
      createdAt: rating.createdAt,
    };
  }
}
