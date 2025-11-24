import { Injectable, Logger } from '@nestjs/common';
import { DriversService } from '../drivers/drivers.service';
import { publishToTopic, getTopicArn } from '../common/aws.utils';

/**
 * Story 2.1: Trip Matching Service
 * Handles async driver matching for trip requests
 */
@Injectable()
export class TripMatchingService {
  private readonly logger = new Logger(TripMatchingService.name);
  private readonly tripEventsTopicArn = getTopicArn('trip-events');

  constructor(private readonly driversService: DriversService) {}

  /**
   * Match a driver for a trip request
   * Called by SQS consumer when TripRequested event received
   */
  async matchDriverForTrip(event: {
    tripId: string;
    passengerId: string;
    pickupLatitude: number;
    pickupLongitude: number;
    pickupAddress: string;
    destinationLatitude: number;
    destinationLongitude: number;
    destinationAddress: string;
    estimatedFare: number;
    estimatedDistance: number;
    requestedAt: string;
  }): Promise<void> {
    this.logger.log('🔍 Matching driver for trip...', {
      tripId: event.tripId,
      pickup: [event.pickupLatitude, event.pickupLongitude],
    });

    try {
      // Search for nearby drivers (within 5km)
      const nearbyDrivers = await this.driversService.searchNearbyDrivers(
        event.pickupLatitude,
        event.pickupLongitude,
        5, // 5km radius
        10, // max 10 drivers
      );

      if (nearbyDrivers.totalFound === 0) {
        this.logger.warn('❌ No drivers available for trip', {
          tripId: event.tripId,
          searchRadius: nearbyDrivers.searchRadius,
        });
        // TODO: Implement retry logic or notify passenger
        return;
      }

      // Select first available driver (closest)
      const selectedDriver = nearbyDrivers.drivers[0];

      this.logger.log('✅ Driver matched successfully', {
        tripId: event.tripId,
        driverId: selectedDriver.driverId,
        distance: selectedDriver.distance,
        driversFound: nearbyDrivers.totalFound,
      });

      // Publish TripMatched event to SNS (fire-and-forget)
      this.publishTripMatchedEvent({
        tripId: event.tripId,
        driverId: selectedDriver.driverId,
        passengerId: event.passengerId,
        driverDistance: selectedDriver.distance,
        matchedAt: new Date().toISOString(),
      })
        .then(() => {
          this.logger.log('📤 TripMatched event published', {
            tripId: event.tripId,
            driverId: selectedDriver.driverId,
          });
        })
        .catch((error) => {
          this.logger.error('Failed to publish TripMatched event (non-blocking)', {
            tripId: event.tripId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
    } catch (error) {
      this.logger.error('Failed to match driver for trip', {
        tripId: event.tripId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error; // Re-throw to trigger SQS retry
    }
  }

  /**
   * Publish TripMatched event to SNS
   */
  private async publishTripMatchedEvent(data: {
    tripId: string;
    driverId: string;
    passengerId: string;
    driverDistance: number;
    matchedAt: string;
  }): Promise<void> {
    try {
      await publishToTopic(
        this.tripEventsTopicArn,
        {
          eventType: 'TripMatched',
          tripId: data.tripId,
          driverId: data.driverId,
          passengerId: data.passengerId,
          driverDistance: data.driverDistance,
          matchedAt: data.matchedAt,
        },
        'Trip Matched - Update Trip Status',
      );
    } catch (error) {
      this.logger.error('Failed to publish TripMatched event', {
        tripId: data.tripId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
