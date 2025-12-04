import { Injectable, Logger } from '@nestjs/common';
import { DriversService } from '../drivers/drivers.service';
import { publishToTopic, getTopicArn } from '../common/aws.utils';

/**
 * Retry configuration for driver matching
 * Phase 1 (0-30s): Retry every 5s with expanding radius (5km → 10km → 15km)
 * Phase 2 (30s-2min): Retry every 10s, keep max radius (15km)
 * Phase 3 (2min-3min): Final attempts every 15s
 */
interface RetryConfig {
  maxDurationMs: number;      // 3 minutes total
  phase1DurationMs: number;   // First 30 seconds
  phase2DurationMs: number;   // 30s to 2min
  phase1IntervalMs: number;   // 5 seconds
  phase2IntervalMs: number;   // 10 seconds
  phase3IntervalMs: number;   // 15 seconds
  searchRadii: number[];      // Expanding radius: 3km, 5km, 10km
}

const RETRY_CONFIG: RetryConfig = {
  maxDurationMs: 3 * 60 * 1000,     // 3 minutes
  phase1DurationMs: 30 * 1000,       // 30 seconds
  phase2DurationMs: 2 * 60 * 1000,   // 2 minutes
  phase1IntervalMs: 5 * 1000,        // 5 seconds
  phase2IntervalMs: 10 * 1000,       // 10 seconds
  phase3IntervalMs: 15 * 1000,       // 15 seconds
  searchRadii: [3, 5, 7],           // km - max 10km to ensure reasonable pickup time
};

/**
 * Story 2.1: Trip Matching Service
 * Handles async driver matching for trip requests
 * Implements retry with expanding radius strategy
 */
@Injectable()
export class TripMatchingService {
  private readonly logger = new Logger(TripMatchingService.name);
  private readonly tripEventsTopicArn = getTopicArn('trip-events');

  constructor(private readonly driversService: DriversService) {}

  /**
   * Match a driver for a trip request
   * Called by SQS consumer when TripRequested event received
   * Implements retry with expanding radius strategy
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
    this.logger.log('🔍 Starting driver matching with retry strategy...', {
      tripId: event.tripId,
      pickup: [event.pickupLatitude, event.pickupLongitude],
      maxDuration: `${RETRY_CONFIG.maxDurationMs / 1000}s`,
    });

    const startTime = Date.now();
    let attemptCount = 0;
    let lastRadiusIndex = 0;

    try {
      while (Date.now() - startTime < RETRY_CONFIG.maxDurationMs) {
        attemptCount++;
        const elapsed = Date.now() - startTime;

        // Determine current phase and search radius
        const { radius, interval } = this.getRetryParams(elapsed, lastRadiusIndex);
        lastRadiusIndex = RETRY_CONFIG.searchRadii.indexOf(radius);

        this.logger.log(`🔄 Attempt #${attemptCount}: Searching within ${radius}km...`, {
          tripId: event.tripId,
          elapsed: `${Math.round(elapsed / 1000)}s`,
          radius,
        });

        // Search for nearby drivers
        const nearbyDrivers = await this.driversService.searchNearbyDrivers(
          event.pickupLatitude,
          event.pickupLongitude,
          radius,
          10, // max 10 drivers
        );

        if (nearbyDrivers.totalFound > 0) {
          // Driver found! Select the closest one
          const selectedDriver = nearbyDrivers.drivers[0];

          this.logger.log('✅ Driver matched successfully', {
            tripId: event.tripId,
            driverId: selectedDriver.driverId,
            distance: selectedDriver.distance,
            driversFound: nearbyDrivers.totalFound,
            attemptCount,
            totalTime: `${Math.round((Date.now() - startTime) / 1000)}s`,
          });

          // Publish TripMatched event to notify trip-service
          await this.publishTripMatchedEvent({
            tripId: event.tripId,
            driverId: selectedDriver.driverId,
            passengerId: event.passengerId,
            driverDistance: selectedDriver.distance,
            matchedAt: new Date().toISOString(),
          });

          this.logger.log('📤 TripMatched event published', {
            tripId: event.tripId,
            driverId: selectedDriver.driverId,
          });

          return; // Success - exit retry loop
        }

        this.logger.log(`⏳ No drivers found at ${radius}km, waiting ${interval / 1000}s before retry...`, {
          tripId: event.tripId,
          attemptCount,
        });

        // Wait before next attempt
        await this.sleep(interval);
      }

      // Exhausted all retries - no drivers available
      this.logger.warn('❌ No drivers found after exhausting all retries', {
        tripId: event.tripId,
        totalAttempts: attemptCount,
        totalDuration: `${Math.round((Date.now() - startTime) / 1000)}s`,
      });

      // Publish NoDriversAvailable event to notify trip-service
      await this.publishNoDriversAvailableEvent({
        tripId: event.tripId,
        passengerId: event.passengerId,
        searchAttempts: attemptCount,
        searchDurationMs: Date.now() - startTime,
        maxRadiusKm: RETRY_CONFIG.searchRadii[RETRY_CONFIG.searchRadii.length - 1],
        failedAt: new Date().toISOString(),
      });

      this.logger.log('📤 NoDriversAvailable event published', {
        tripId: event.tripId,
      });

    } catch (error) {
      this.logger.error('Failed to match driver for trip', {
        tripId: event.tripId,
        attemptCount,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Even on unexpected error, notify passenger so they don't wait forever
      // This ensures graceful degradation
      try {
        await this.publishNoDriversAvailableEvent({
          tripId: event.tripId,
          passengerId: event.passengerId,
          searchAttempts: attemptCount,
          searchDurationMs: Date.now() - startTime,
          maxRadiusKm: RETRY_CONFIG.searchRadii[RETRY_CONFIG.searchRadii.length - 1],
          failedAt: new Date().toISOString(),
        });
        this.logger.log('📤 NoDriversAvailable event published (due to error)', {
          tripId: event.tripId,
        });
        // Don't re-throw - we've notified the passenger, message can be deleted
      } catch (publishError) {
        // If even the notification fails, THEN we re-throw to trigger SQS retry
        this.logger.error('Failed to publish NoDriversAvailable after error', {
          tripId: event.tripId,
          originalError: error instanceof Error ? error.message : 'Unknown',
          publishError: publishError instanceof Error ? publishError.message : 'Unknown',
        });
        throw error; // Re-throw original error to trigger SQS retry
      }
    }
  }

  /**
   * Get retry parameters based on elapsed time
   */
  private getRetryParams(elapsedMs: number, currentRadiusIndex: number): { radius: number; interval: number } {
    const { phase1DurationMs, phase2DurationMs, phase1IntervalMs, phase2IntervalMs, phase3IntervalMs, searchRadii } = RETRY_CONFIG;

    let interval: number;
    let radiusIndex: number;

    if (elapsedMs < phase1DurationMs) {
      // Phase 1: Aggressive retry with expanding radius
      interval = phase1IntervalMs;
      // Expand radius every 10 seconds in phase 1
      radiusIndex = Math.min(Math.floor(elapsedMs / 10000), searchRadii.length - 1);
    } else if (elapsedMs < phase2DurationMs) {
      // Phase 2: Moderate retry at max radius
      interval = phase2IntervalMs;
      radiusIndex = searchRadii.length - 1; // Max radius
    } else {
      // Phase 3: Final attempts
      interval = phase3IntervalMs;
      radiusIndex = searchRadii.length - 1; // Max radius
    }

    return {
      radius: searchRadii[radiusIndex],
      interval,
    };
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  /**
   * Publish NoDriversAvailable event to SNS
   * Notifies trip-service to update trip status and inform passenger
   */
  private async publishNoDriversAvailableEvent(data: {
    tripId: string;
    passengerId: string;
    searchAttempts: number;
    searchDurationMs: number;
    maxRadiusKm: number;
    failedAt: string;
  }): Promise<void> {
    try {
      await publishToTopic(
        this.tripEventsTopicArn,
        {
          eventType: 'NoDriversAvailable',
          tripId: data.tripId,
          passengerId: data.passengerId,
          searchAttempts: data.searchAttempts,
          searchDurationMs: data.searchDurationMs,
          maxRadiusKm: data.maxRadiusKm,
          failedAt: data.failedAt,
        },
        'No Drivers Available - Notify Passenger',
      );
    } catch (error) {
      this.logger.error('Failed to publish NoDriversAvailable event', {
        tripId: data.tripId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
