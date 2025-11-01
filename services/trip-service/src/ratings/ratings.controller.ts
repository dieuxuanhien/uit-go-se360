import {
  Controller,
  Post,
  Get,
  Param,
  Body,
  HttpCode,
  UseGuards,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RatingsService } from './ratings.service';
import { CreateRatingDto } from './dto/create-rating.dto';
import { RatingDto } from './dto/rating.dto';
import { JwtPayload } from '../common/types/jwt.types';

/**
 * Ratings Controller
 * Handles HTTP requests for trip ratings
 */
@Controller('trips/:tripId/rating')
@ApiBearerAuth()
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
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateRatingDto,
  ): Promise<RatingDto> {
    return this.ratingsService.submitRating(tripId, user.userId, dto);
  }

  @ApiOperation({
    summary: 'Get trip rating',
    description: 'Retrieve rating for a specific trip.',
  })
  @ApiParam({
    name: 'tripId',
    description: 'Trip ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Rating retrieved successfully',
    type: RatingDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - Not trip participant' })
  @ApiResponse({
    status: 404,
    description: 'Trip not found or no rating exists',
  })
  @Get()
  @UseGuards(JwtAuthGuard)
  async getRating(
    @Param('tripId') tripId: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<RatingDto> {
    return this.ratingsService.getRating(tripId, user.userId);
  }
}
