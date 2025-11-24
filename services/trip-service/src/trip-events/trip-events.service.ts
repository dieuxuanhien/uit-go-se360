import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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
}
