import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TripStatus, NotificationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriverServiceClient } from '../drivers/driver-service.client';
import driverNotificationConfig from '../config/driver-notification.config';
import { NotificationDto } from './dto';

interface FindAndNotifyResult {
  driversNotified: number;
}

@Injectable()
export class DriverNotificationService {
  private readonly logger = new Logger(DriverNotificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly driverServiceClient: DriverServiceClient,
    @Inject(driverNotificationConfig.KEY)
    private readonly config: ConfigType<typeof driverNotificationConfig>,
  ) {}

  async findAndNotifyDrivers(
    tripId: string,
    pickupLatitude: number,
    pickupLongitude: number,
  ): Promise<FindAndNotifyResult> {
    this.logger.log('Finding drivers for trip', {
      tripId,
      pickupLatitude,
      pickupLongitude,
    });

    const { initial, second, final } = this.config.searchRadii;
    const radii = [initial, second, final];

    let searchResult = null;
    let usedRadius = 0;

    // Try each radius until we find drivers
    for (const radius of radii) {
      try {
        this.logger.log(`Searching with radius ${radius}km`, {
          tripId,
          radius,
        });

        searchResult = await this.driverServiceClient.searchNearbyDrivers(
          pickupLatitude,
          pickupLongitude,
          radius,
          this.config.notificationLimit,
        );

        if (searchResult.drivers.length > 0) {
          usedRadius = radius;
          break;
        }

        this.logger.log(`No drivers found at ${radius}km, expanding search`, {
          tripId,
          radius,
        });
      } catch (error) {
        this.logger.error('Driver search failed', {
          tripId,
          radius,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Continue to next radius if search fails
        continue;
      }
    }

    // No drivers found in any radius
    if (!searchResult || searchResult.drivers.length === 0) {
      this.logger.warn('No drivers available for trip', { tripId });

      await this.prisma.trip.update({
        where: { id: tripId },
        data: { status: TripStatus.NO_DRIVERS_AVAILABLE },
      });

      return { driversNotified: 0 };
    }

    // Create notification records for found drivers in a transaction
    try {
      const driversToNotify = searchResult.drivers.slice(
        0,
        this.config.notificationLimit,
      );

      await this.prisma.$transaction(async (tx) => {
        // Create notification records
        await tx.driverNotification.createMany({
          data: driversToNotify.map((driver) => ({
            tripId,
            driverId: driver.driverId,
            status: NotificationStatus.PENDING,
            notifiedAt: new Date(),
          })),
        });

        // Update trip status to FINDING_DRIVER
        await tx.trip.update({
          where: { id: tripId },
          data: { status: TripStatus.FINDING_DRIVER },
        });
      });

      this.logger.log(
        `Notified ${driversToNotify.length} drivers for trip ${tripId} at radius ${usedRadius}km`,
        {
          tripId,
          driversNotified: driversToNotify.length,
          radius: usedRadius,
          driverIds: driversToNotify.map((d) => d.driverId),
        },
      );

      return { driversNotified: driversToNotify.length };
    } catch (error) {
      this.logger.error('Failed to create driver notifications', {
        tripId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  async getDriverNotifications(driverId: string): Promise<NotificationDto[]> {
    const fifteenSecondsAgo = new Date(Date.now() - 15000); // 15 seconds in milliseconds

    const notifications = await this.prisma.driverNotification.findMany({
      where: {
        driverId,
        status: NotificationStatus.PENDING,
        notifiedAt: {
          gte: fifteenSecondsAgo,
        },
      },
      include: {
        trip: true,
      },
      orderBy: {
        notifiedAt: 'asc',
      },
    });

    const result: NotificationDto[] = notifications
      .map((notification) => {
        const ageInSeconds = Math.floor(
          (Date.now() - notification.notifiedAt.getTime()) / 1000,
        );
        const timeRemainingSeconds = Math.max(0, 15 - ageInSeconds);

        // Skip if expired
        if (timeRemainingSeconds <= 0) {
          return null;
        }

        return {
          notificationId: notification.id,
          tripId: notification.tripId,
          pickupLatitude: Number(notification.trip.pickupLatitude),
          pickupLongitude: Number(notification.trip.pickupLongitude),
          pickupAddress: notification.trip.pickupAddress,
          destinationLatitude: Number(notification.trip.destinationLatitude),
          destinationLongitude: Number(notification.trip.destinationLongitude),
          destinationAddress: notification.trip.destinationAddress,
          estimatedFare: notification.trip.estimatedFare,
          timeRemainingSeconds,
          notifiedAt: notification.notifiedAt,
        };
      })
      .filter((dto): dto is NotificationDto => dto !== null);

    this.logger.log('Retrieved notifications for driver', {
      driverId,
      count: result.length,
    });

    return result;
  }
}
