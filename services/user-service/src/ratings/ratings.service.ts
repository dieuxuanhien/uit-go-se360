import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { Rating } from '@prisma/client';
import { TripStatus, UserRole } from '@uit-go/shared-types';
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

  /**
   * Get rating by trip ID with authorization
   * @param tripId Trip ID
   * @param userId User ID
   * @param userRole User role
   * @returns Rating DTO
   */
  async getRatingByTripId(
    tripId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<RatingDto> {
    // 1. Fetch trip from TripService
    const trip = await this.tripServiceClient.getTripById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip ${tripId} not found`);
    }

    // 2. Authorization: verify user is trip participant
    if (userRole === UserRole.PASSENGER) {
      if (trip.passengerId !== userId) {
        throw new ForbiddenException(
          'You are not authorized to view this rating',
        );
      }
    } else if (userRole === UserRole.DRIVER) {
      if (trip.driverId !== userId) {
        throw new ForbiddenException(
          'You are not authorized to view this rating',
        );
      }
    } else {
      throw new ForbiddenException('Invalid user role');
    }

    // 3. Fetch rating from repository
    const rating = await this.ratingsRepository.findByTripId(tripId);
    if (!rating) {
      throw new NotFoundException(`No rating found for trip ${tripId}`);
    }

    // 4. Log rating retrieval
    this.logger.log('Rating retrieved', {
      ratingId: rating.id,
      tripId,
      userId,
      userRole,
    });

    // 5. Map to DTO with conditional field exclusion
    return this.mapToDto(rating, userRole);
  }

  private mapToDto(rating: Rating, userRole?: UserRole): RatingDto {
    const dto: RatingDto = {
      id: rating.id,
      tripId: rating.tripId,
      stars: rating.stars,
      comment: rating.comment,
      createdAt: rating.createdAt,
    };

    // Include fields based on requester role
    if (!userRole || userRole === UserRole.PASSENGER) {
      dto.passengerId = rating.passengerId;
      dto.driverId = rating.driverId;
    } else if (userRole === UserRole.DRIVER) {
      // Exclude passengerId for driver view (AC: 3)
      dto.driverId = rating.driverId;
    }

    return dto;
  }
}
