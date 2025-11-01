import {
  Controller,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { TripsService } from './trips.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripResponseDto } from './dto/trip-response.dto';
import { TripDto } from './dto/trip.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtPayload } from '../common/types/jwt.types';
import { Get, Param } from '@nestjs/common';
import { ApiParam } from '@nestjs/swagger';

@ApiTags('trips')
@Controller('trips')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class TripsController {
  constructor(private readonly tripsService: TripsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles('PASSENGER')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new trip request' })
  @ApiResponse({
    status: 201,
    description: 'Trip created successfully',
    type: TripResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only passengers can create trips',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
  })
  async createTrip(
    @CurrentUser() user: JwtPayload,
    @Body() createTripDto: CreateTripDto,
  ): Promise<TripResponseDto> {
    return this.tripsService.createTrip(user.userId, createTripDto);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  @ApiParam({
    name: 'id',
    description: 'Trip ID (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiOperation({ summary: 'Get trip details by ID' })
  @ApiResponse({
    status: 200,
    description: 'Trip details retrieved successfully',
    type: TripDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing token',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - User not authorized to view this trip',
  })
  @ApiResponse({ status: 404, description: 'Trip not found' })
  async getTripById(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<TripDto> {
    return this.tripsService.getTripById(id, user.userId, user.role);
  }
}
