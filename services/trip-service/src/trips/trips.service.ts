import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { Trip, TripStatus } from '@prisma/client';
import { TripsRepository } from './trips.repository';
import { FareCalculatorService } from '../fare/fare-calculator.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripResponseDto } from './dto/trip-response.dto';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly tripsRepository: TripsRepository,
    private readonly fareCalculator: FareCalculatorService,
  ) {}

  async createTrip(
    passengerId: string,
    dto: CreateTripDto,
  ): Promise<TripResponseDto> {
    try {
      // Calculate distance between pickup and destination
      const distance = this.fareCalculator.calculateDistance(
        dto.pickupLatitude,
        dto.pickupLongitude,
        dto.destinationLatitude,
        dto.destinationLongitude,
      );

      // Calculate estimated fare based on distance
      const estimatedFare =
        this.fareCalculator.calculateEstimatedFare(distance);

      // Create trip record
      const trip = await this.tripsRepository.create({
        passengerId,
        pickupLatitude: dto.pickupLatitude,
        pickupLongitude: dto.pickupLongitude,
        pickupAddress: dto.pickupAddress,
        destinationLatitude: dto.destinationLatitude,
        destinationLongitude: dto.destinationLongitude,
        destinationAddress: dto.destinationAddress,
        estimatedDistance: distance,
        estimatedFare,
        status: TripStatus.REQUESTED,
      });

      this.logger.log('Trip created', {
        tripId: trip.id,
        passengerId,
        distance,
        estimatedFare,
      });

      return this.mapToDto(trip);
    } catch (error) {
      this.logger.error('Failed to create trip', {
        passengerId,
        error: error.message,
      });
      throw new InternalServerErrorException('Failed to create trip');
    }
  }

  private mapToDto(trip: Trip): TripResponseDto {
    return {
      id: trip.id,
      passengerId: trip.passengerId,
      driverId: trip.driverId,
      status: trip.status,
      pickupLatitude: Number(trip.pickupLatitude),
      pickupLongitude: Number(trip.pickupLongitude),
      pickupAddress: trip.pickupAddress,
      destinationLatitude: Number(trip.destinationLatitude),
      destinationLongitude: Number(trip.destinationLongitude),
      destinationAddress: trip.destinationAddress,
      estimatedFare: trip.estimatedFare,
      actualFare: trip.actualFare,
      estimatedDistance: Number(trip.estimatedDistance),
      requestedAt: trip.requestedAt,
      driverAssignedAt: trip.driverAssignedAt,
      startedAt: trip.startedAt,
      completedAt: trip.completedAt,
      cancelledAt: trip.cancelledAt,
      cancellationReason: trip.cancellationReason,
      createdAt: trip.createdAt,
      updatedAt: trip.updatedAt,
    };
  }
}
