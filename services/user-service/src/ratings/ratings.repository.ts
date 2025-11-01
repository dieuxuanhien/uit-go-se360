import { Injectable, Logger, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Rating, Prisma } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

/**
 * Ratings Repository
 * Handles all database operations for Rating entity
 */
@Injectable()
export class RatingsRepository {
  private readonly logger = new Logger(RatingsRepository.name);

  constructor(private readonly prisma: DatabaseService) {}

  /**
   * Create a new rating
   * @param data Rating creation data
   * @returns Created rating
   */
  async create(data: any): Promise<Rating> {
    try {
      const rating = await this.prisma.rating.create({
        data,
      });
      this.logger.log('Rating created', {
        ratingId: rating.id,
        tripId: data.tripId,
      });
      return rating;
    } catch (error) {
      if (
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Prisma unique constraint violation
        throw new ConflictException(
          `Trip ${data.tripId} has already been rated`,
        );
      }
      throw error;
    }
  }

  /**
   * Find rating by trip ID
   * @param tripId Trip ID
   * @returns Rating or null if not found
   */
  async findByTripId(tripId: string): Promise<Rating | null> {
    return await this.prisma.rating.findUnique({
      where: { tripId },
    });
  }
}
