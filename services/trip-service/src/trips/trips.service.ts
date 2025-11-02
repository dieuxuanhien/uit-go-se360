import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { Trip, TripStatus } from '@prisma/client';
import { TripsRepository } from './trips.repository';
import { FareCalculatorService } from '../fare/fare-calculator.service';
import { DriverNotificationService } from '../notifications/driver-notification.service';
import { CreateTripDto } from './dto/create-trip.dto';
import { TripResponseDto } from './dto/trip-response.dto';
import { TripDto } from './dto/trip.dto';
import { TripLocationDto } from './dto/trip-location.dto';
import { DriverServiceClient } from '../drivers/driver-service.client';
import { TripStateMachine } from './trip-state-machine';

@Injectable()
export class TripsService {
  private readonly logger = new Logger(TripsService.name);

  constructor(
    private readonly tripsRepository: TripsRepository,
    private readonly fareCalculator: FareCalculatorService,
    private readonly driverNotificationService: DriverNotificationService,
    private readonly driverServiceClient: DriverServiceClient,
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
    const trip = await this.tripsRepository.findById(tripId);

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

  private mapToTripDto(trip: Trip): TripDto {
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
      pickedUpAt: trip.pickedUpAt,
      completedAt: trip.completedAt,
      cancelledAt: trip.cancelledAt,
      cancellationReason: trip.cancellationReason,
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
    const updatedTrip = await this.tripsRepository.findById(tripId);
    if (!updatedTrip) {
      throw new InternalServerErrorException('Failed to fetch updated trip');
    }

    return this.mapToTripDto(updatedTrip);
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
    const updatedTrip = await this.tripsRepository.findById(tripId);
    if (!updatedTrip) {
      throw new InternalServerErrorException('Failed to fetch updated trip');
    }

    return this.mapToTripDto(updatedTrip);
  }

  async startActiveTrip(tripId: string, driverId: string): Promise<TripDto> {
    // Fetch trip
    const trip = await this.tripsRepository.findById(tripId);

    // Validate existence
    if (!trip) {
      throw new NotFoundException(`Trip with ID ${tripId} not found`);
    }

    // Validate status
    if (trip.status !== TripStatus.ARRIVED_AT_PICKUP) {
      throw new BadRequestException(
        `Cannot start trip in ${trip.status} status. Trip must be in ARRIVED_AT_PICKUP status.`,
      );
    }

    // Validate driver authorization
    if (trip.driverId !== driverId) {
      this.logger.warn('Unauthorized trip start attempt', {
        tripId,
        attemptedByDriver: driverId,
        assignedDriver: trip.driverId,
      });
      throw new ForbiddenException(
        'Only the assigned driver can start this trip',
      );
    }

    // Update trip status with pickedUpAt timestamp
    await this.tripsRepository.updateStatus(tripId, TripStatus.IN_PROGRESS, {
      pickedUpAt: new Date(),
    });

    this.logger.log('Trip started - passenger picked up', {
      tripId,
      driverId,
      previousStatus: TripStatus.ARRIVED_AT_PICKUP,
      newStatus: TripStatus.IN_PROGRESS,
    });

    // Fetch updated trip with users for response
    const updatedTrip = await this.tripsRepository.findById(tripId);
    if (!updatedTrip) {
      throw new InternalServerErrorException('Failed to fetch updated trip');
    }

    return this.mapToTripDto(updatedTrip);
  }

  async getCurrentTripLocation(
    tripId: string,
    userId: string,
  ): Promise<TripLocationDto> {
    // Fetch trip
    const trip = await this.tripsRepository.findById(tripId);

    if (!trip) {
      throw new NotFoundException(`Trip with ID ${tripId} not found`);
    }

    // Validate trip has assigned driver
    if (!trip.driverId) {
      throw new BadRequestException('Trip does not have an assigned driver');
    }

    // Validate trip status is active
    if (
      trip.status !== TripStatus.EN_ROUTE_TO_PICKUP &&
      trip.status !== TripStatus.ARRIVED_AT_PICKUP &&
      trip.status !== TripStatus.IN_PROGRESS
    ) {
      throw new BadRequestException(
        `Trip must be in an active status to retrieve location`,
      );
    }

    // Authorization check
    if (trip.passengerId !== userId && trip.driverId !== userId) {
      this.logger.warn('Unauthorized location access attempt', {
        tripId,
        userId,
        passengerId: trip.passengerId,
        driverId: trip.driverId,
      });
      throw new ForbiddenException(
        'Only trip passenger or driver can view location',
      );
    }

    // Fetch driver location from DriverService
    const location = await this.driverServiceClient.getDriverLocation(
      trip.driverId,
    );

    if (!location) {
      throw new NotFoundException('No location available for this trip');
    }

    // Check location staleness (> 2 minutes)
    const TWO_MINUTES_MS = 2 * 60 * 1000;
    const locationAge = Date.now() - new Date(location.timestamp).getTime();

    if (locationAge > TWO_MINUTES_MS) {
      this.logger.warn('Location is stale', {
        tripId,
        driverId: trip.driverId,
        locationAge: `${Math.floor(locationAge / 1000)}s`,
      });
      throw new NotFoundException(
        'No recent location update available for this trip',
      );
    }

    this.logger.log('Trip location retrieved', {
      tripId,
      userId,
      driverId: trip.driverId,
      locationAge: `${Math.floor(locationAge / 1000)}s`,
    });

    return {
      tripId: trip.id,
      driverId: trip.driverId,
      latitude: location.latitude,
      longitude: location.longitude,
      heading: location.heading,
      speed: location.speed,
      accuracy: location.accuracy,
      timestamp: location.timestamp,
    };
  }

  async completeTrip(tripId: string, driverId: string): Promise<TripDto> {
    // 1. Fetch trip
    const trip = await this.tripsRepository.findById(tripId);
    if (!trip) {
      throw new NotFoundException(`Trip with ID ${tripId} not found`);
    }

    // 2. Authorization: verify assigned driver
    if (trip.driverId !== driverId) {
      throw new ForbiddenException('Only assigned driver can complete trip');
    }

    // 3. State validation: must be IN_PROGRESS
    if (!TripStateMachine.canTransitionTo(trip.status, TripStatus.COMPLETED)) {
      throw new BadRequestException(
        TripStateMachine.getInvalidTransitionMessage(
          trip.status,
          TripStatus.COMPLETED,
        ),
      );
    }

    // 4. Calculate actual fare (MVP: same as estimated)
    const actualFare = this.fareCalculator.calculateActualFare(trip);

    // 5. Set completion timestamp
    const completedAt = new Date();

    // 6. Update trip in database
    const updatedTrip = await this.tripsRepository.updateStatus(
      tripId,
      TripStatus.COMPLETED,
      { completedAt },
      { actualFare },
    );
    console.log('Trip updated to COMPLETED:', updatedTrip);
    // 7. Log completion event
    this.logger.log('Trip completed', {
      tripId,
      driverId,
      actualFare,
      tripDuration: completedAt.getTime() - (trip.startedAt?.getTime() || 0),
    });

    // 8. Return DTO
    const finalTrip = await this.tripsRepository.findById(tripId);
    if (!finalTrip) {
      throw new InternalServerErrorException('Failed to fetch completed trip');
    }

    return this.mapToTripDto(finalTrip);
  }
}
