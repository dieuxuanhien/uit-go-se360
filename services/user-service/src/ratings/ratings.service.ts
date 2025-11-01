import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Rating } from '@prisma/client';
import { TripStatus } from '@uit-go/shared-types';
import { RatingsRepository } from './ratings.repository';
import { TripServiceClient } from '../integrations/trip-service.client';
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
    private readonly tripServiceClient: TripServiceClient,
  ) {}

  /**
   * Submit a rating for a completed trip
   * @param tripId Trip ID
   * @param passengerId Passenger ID
   * @param dto Rating data
   * @returns Created rating DTO
   */
  async submitRating(
    tripId: string,
    passengerId: string,
    dto: CreateRatingDto,
  ): Promise<RatingDto> {
    // 1. Fetch trip from TripService
    const trip = await this.tripServiceClient.getTripById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    // 2. Authorization: verify trip's passenger
    if (trip.passengerId !== passengerId) {
      throw new ForbiddenException(
        "Only the trip's passenger can submit a rating",
      );
    }

    // 3. Status validation: must be COMPLETED
    if (trip.status !== TripStatus.COMPLETED) {
      throw new BadRequestException(
        `Cannot rate trip that is not completed. Current status: ${trip.status}`,
      );
    }

    // 4. Check for existing rating (prevent duplicates)
    const existingRating = await this.ratingsRepository.findByTripId(tripId);
    if (existingRating) {
      throw new ConflictException(`Trip ${tripId} has already been rated`);
    }

    // 5. Create rating with auto-populated IDs
    const rating = await this.ratingsRepository.create({
      tripId,
      passengerId,
      driverId: trip.driverId,
      stars: dto.stars,
      comment: dto.comment ?? null,
    });

    // 6. Log rating submission
    this.logger.log('Rating submitted', {
      ratingId: rating.id,
      tripId,
      passengerId,
      driverId: trip.driverId,
      stars: dto.stars,
    });

    // 7. Return DTO
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
