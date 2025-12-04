import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TripStatus } from '@prisma/client';

/**
 * Story 2.1: Trip Events Service
 * Handles trip status updates from async events
 */
@Injectable()
export class TripEventsService {
  private readonly logger = new Logger(TripEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Handle TripMatched event
   * Updates trip with matched driver information
   */
  async handleTripMatched(event: {
    tripId: string;
    driverId: string;
    passengerId: string;
    driverDistance: number;
    matchedAt: string;
  }): Promise<void> {
    this.logger.log('🔄 Updating trip with matched driver...', {
      tripId: event.tripId,
      driverId: event.driverId,
      driverDistance: event.driverDistance,
    });

    try {
      // Fetch trip to validate it exists
      const trip = await this.prisma.trip.findUnique({
        where: { id: event.tripId },
      });

      if (!trip) {
        this.logger.error('Trip not found', { tripId: event.tripId });
        throw new Error(`Trip ${event.tripId} not found`);
      }

      // Validate trip is in REQUESTED status
      if (trip.status !== 'REQUESTED') {
        this.logger.warn('Trip not in REQUESTED status, skipping update', {
          tripId: event.tripId,
          currentStatus: trip.status,
        });
        return;
      }

      // Update trip with driver assignment
      await this.prisma.trip.update({
        where: { id: event.tripId },
        data: {
          driverId: event.driverId,
          status: 'DRIVER_ASSIGNED',
          driverAssignedAt: new Date(event.matchedAt),
        },
      });

      this.logger.log('✅ Trip updated successfully', {
        tripId: event.tripId,
        driverId: event.driverId,
        newStatus: 'DRIVER_ASSIGNED',
      });
    } catch (error) {
      this.logger.error('Failed to update trip', {
        tripId: event.tripId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error; // Re-throw to trigger SQS retry
    }
  }

  /**
   * Handle NoDriversAvailable event
   * Updates trip status and could trigger passenger notification
   */
  async handleNoDriversAvailable(event: {
    tripId: string;
    passengerId: string;
    searchAttempts: number;
    searchDurationMs: number;
    maxRadiusKm: number;
    failedAt: string;
  }): Promise<void> {
    this.logger.log('🔄 Handling NoDriversAvailable event...', {
      tripId: event.tripId,
      passengerId: event.passengerId,
      searchAttempts: event.searchAttempts,
      searchDurationMs: event.searchDurationMs,
    });

    try {
      // Fetch trip to validate it exists
      const trip = await this.prisma.trip.findUnique({
        where: { id: event.tripId },
      });

      if (!trip) {
        this.logger.error('Trip not found', { tripId: event.tripId });
        throw new Error(`Trip ${event.tripId} not found`);
      }

      // Only update if trip is still in REQUESTED status
      // (might have been cancelled or matched by another process)
      if (trip.status !== TripStatus.REQUESTED && trip.status !== TripStatus.FINDING_DRIVER) {
        this.logger.warn('Trip not in REQUESTED/FINDING_DRIVER status, skipping update', {
          tripId: event.tripId,
          currentStatus: trip.status,
        });
        return;
      }

      // Update trip status to NO_DRIVERS_AVAILABLE
      await this.prisma.trip.update({
        where: { id: event.tripId },
        data: {
          status: TripStatus.NO_DRIVERS_AVAILABLE,
          cancelledAt: new Date(event.failedAt),
          cancellationReason: `No drivers found after ${event.searchAttempts} attempts over ${Math.round(event.searchDurationMs / 1000)}s (searched up to ${event.maxRadiusKm}km radius)`,
        },
      });

      this.logger.log('✅ Trip updated to NO_DRIVERS_AVAILABLE', {
        tripId: event.tripId,
        passengerId: event.passengerId,
        searchAttempts: event.searchAttempts,
        searchDuration: `${Math.round(event.searchDurationMs / 1000)}s`,
      });

      // TODO: Integrate with notification service to send push/SMS to passenger
      // Example: await this.notificationService.notifyPassenger(event.passengerId, {
      //   type: 'NO_DRIVERS_AVAILABLE',
      //   tripId: event.tripId,
      //   message: 'Sorry, no drivers are currently available in your area. Please try again later.',
      // });

    } catch (error) {
      this.logger.error('Failed to handle NoDriversAvailable event', {
        tripId: event.tripId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error; // Re-throw to trigger SQS retry
    }
  }
}
