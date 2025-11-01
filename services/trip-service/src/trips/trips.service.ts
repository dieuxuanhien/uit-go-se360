import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Trip, TripStatus, Prisma, User } from '@prisma/client';
import { TripsRepository } from './trips.repository';
import { FareCalculatorService } from '../fare/fare-calculator.service';
import { DriverNotificationService } from '../notifications/driver-notification.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripResponseDto } from './dto/trip-response.dto';
import { TripDto } from './dto/trip.dto';
import { UserDto } from './dto/user.dto';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly tripsRepository: TripsRepository,
    private readonly fareCalculator: FareCalculatorService,
    private readonly driverNotificationService: DriverNotificationService,
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

      this.logger.log('Trip created, searching for drivers...', {
        tripId: trip.id,
        passengerId,
        distance,
        estimatedFare,
      });

      // Find and notify nearby drivers (async)
      // This runs in background - we don't wait for it to complete
      setImmediate(async () => {
        try {
          const result =
            await this.driverNotificationService.findAndNotifyDrivers(
              trip.id,
              dto.pickupLatitude,
              dto.pickupLongitude,
            );

          if (result.driversNotified > 0) {
            this.logger.log('Drivers notified successfully', {
              tripId: trip.id,
              driversNotified: result.driversNotified,
            });
          } else {
            this.logger.warn('No drivers available for trip', {
              tripId: trip.id,
            });
          }
        } catch (error) {
          this.logger.error('Failed to notify drivers', {
            tripId: trip.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
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

  async getTripById(
    tripId: string,
    userId: string,
    userRole: string,
  ): Promise<TripDto> {
    const trip = await this.tripsRepository.findByIdWithUsers(tripId);

    if (!trip) {
      throw new NotFoundException(`Trip with ID ${tripId} not found`);
    }

    // Authorization check
    if (userRole === 'PASSENGER' && trip.passengerId !== userId) {
      this.logger.warn('Unauthorized trip access attempt', {
        tripId,
        userId,
        userRole,
        tripPassengerId: trip.passengerId,
      });
      throw new ForbiddenException('You are not authorized to view this trip');
    }

    if (userRole === 'DRIVER' && (!trip.driverId || trip.driverId !== userId)) {
      this.logger.warn('Unauthorized trip access attempt', {
        tripId,
        userId,
        userRole,
        tripDriverId: trip.driverId,
      });
      throw new ForbiddenException('You are not authorized to view this trip');
    }

    this.logger.log('Trip retrieved', { tripId, userId, userRole });

    return this.mapToTripDto(trip);
  }

  private mapToTripDto(
    trip: Prisma.TripGetPayload<{ include: { passenger: true; driver: true } }>,
  ): TripDto {
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
      arrivedAt: trip.arrivedAt,
      completedAt: trip.completedAt,
      cancelledAt: trip.cancelledAt,
      cancellationReason: trip.cancellationReason,
      passenger: trip.passenger ? this.mapUserToDto(trip.passenger) : undefined,
      driver: trip.driver ? this.mapUserToDto(trip.driver) : null,
    };
  }

  private mapUserToDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
    };
  }

  async startPickup(tripId: string, driverId: string): Promise<TripDto> {
    // Fetch trip
    const trip = await this.tripsRepository.findById(tripId);

    // Validate existence
    if (!trip) {
      throw new NotFoundException(`Trip with ID ${tripId} not found`);
    }

    // Validate status
    if (trip.status !== TripStatus.DRIVER_ASSIGNED) {
      throw new BadRequestException(
        `Cannot start pickup for trip in ${trip.status} status. Trip must be in DRIVER_ASSIGNED status.`,
      );
    }

    // Validate driver authorization
    if (trip.driverId !== driverId) {
      this.logger.warn('Unauthorized pickup start attempt', {
        tripId,
        attemptedByDriver: driverId,
        assignedDriver: trip.driverId,
      });
      throw new ForbiddenException(
        'Only the assigned driver can start pickup for this trip',
      );
    }

    // Update trip status
    await this.tripsRepository.updateStatus(
      tripId,
      TripStatus.EN_ROUTE_TO_PICKUP,
      { startedAt: new Date() },
    );

    this.logger.log('Trip pickup started', {
      tripId,
      driverId,
      previousStatus: TripStatus.DRIVER_ASSIGNED,
      newStatus: TripStatus.EN_ROUTE_TO_PICKUP,
    });

    // Fetch updated trip with users for response
    const tripWithUsers = await this.tripsRepository.findByIdWithUsers(tripId);
    if (!tripWithUsers) {
      throw new InternalServerErrorException('Failed to fetch updated trip');
    }

    return this.mapToTripDto(tripWithUsers);
  }

  async arriveAtPickup(tripId: string, driverId: string): Promise<TripDto> {
    // Fetch trip
    const trip = await this.tripsRepository.findById(tripId);

    // Validate existence
    if (!trip) {
      throw new NotFoundException(`Trip with ID ${tripId} not found`);
    }

    // Validate status
    if (trip.status !== TripStatus.EN_ROUTE_TO_PICKUP) {
      throw new BadRequestException(
        `Cannot mark arrival for trip in ${trip.status} status. Trip must be in EN_ROUTE_TO_PICKUP status.`,
      );
    }

    // Validate driver authorization
    if (trip.driverId !== driverId) {
      this.logger.warn('Unauthorized arrival attempt', {
        tripId,
        attemptedByDriver: driverId,
        assignedDriver: trip.driverId,
      });
      throw new ForbiddenException(
        'Only the assigned driver can mark arrival for this trip',
      );
    }

    // Update trip status with arrivedAt timestamp
    await this.tripsRepository.updateStatus(
      tripId,
      TripStatus.ARRIVED_AT_PICKUP,
      { arrivedAt: new Date() },
    );

    this.logger.log('Driver arrived at pickup', {
      tripId,
      driverId,
      previousStatus: TripStatus.EN_ROUTE_TO_PICKUP,
      newStatus: TripStatus.ARRIVED_AT_PICKUP,
    });

    // Fetch updated trip with users for response
    const tripWithUsers = await this.tripsRepository.findByIdWithUsers(tripId);
    if (!tripWithUsers) {
      throw new InternalServerErrorException('Failed to fetch updated trip');
    }

    return this.mapToTripDto(tripWithUsers);
  }
}
