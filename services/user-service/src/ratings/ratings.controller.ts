import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  ForbiddenException,
  HttpCode,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { User } from '@prisma/client';
import { UserRole } from '@uit-go/shared-types';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { RatingDto } from './dto/rating.dto';

/**
 * Ratings Controller
 * Handles HTTP requests for trip ratings
 */
@Controller('trips/:tripId/rating')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService) {}

  @ApiOperation({
    summary: 'Submit trip rating',
    description:
      'Passenger rates completed trip with 1-5 stars and optional comment.',
  })
  @ApiParam({
    name: 'tripId',
    description: 'Trip ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 201,
    description: 'Rating submitted successfully',
    type: RatingDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or trip not completed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Not trip passenger' })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  @ApiResponse({
    status: 409,
    description: 'Rating already exists for this trip',
  })
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(201)
  async submitRating(
    @Param('tripId') tripId: string,
    @CurrentUser() user: any,
    @Body() createRatingDto: CreateRatingDto,
  ): Promise<RatingDto> {
    // Verify user is passenger
    if (user.role !== UserRole.PASSENGER) {
      throw new ForbiddenException('Only passengers can rate trips');
    }

    return this.ratingsService.submitRating(
      tripId,
      user.userId,
      createRatingDto,
    );
  }
}
