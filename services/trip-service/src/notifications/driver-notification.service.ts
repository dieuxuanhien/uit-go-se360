import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigType } from '@nestjs/config';
import { TripStatus, NotificationStatus, Trip } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DriverServiceClient } from '../drivers/driver-service.client';
import driverNotificationConfig from '../config/driver-notification.config';
import { NotificationDto } from './dto';
import { TripResponseDto } from '../trips/dto/trip-response.dto';

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

  async acceptNotification(
    notificationId: string,
    driverId: string,
  ): Promise<TripResponseDto> {
    this.logger.log('Driver accepting notification', {
      notificationId,
      driverId,
    });

    // Query notification with related trip data
    const notification = await this.prisma.driverNotification.findUnique({
      where: { id: notificationId },
      include: { trip: true },
    });

    // Check if notification exists
    if (!notification) {
      this.logger.warn('Notification not found', { notificationId });
      throw new NotFoundException('Notification not found');
    }

    // Validate notification belongs to authenticated driver
    if (notification.driverId !== driverId) {
      this.logger.warn('Notification does not belong to driver', {
        notificationId,
        notificationDriverId: notification.driverId,
        requestDriverId: driverId,
      });
      throw new ForbiddenException(
        'Notification does not belong to this driver',
      );
    }

    // Check if notification is expired (older than 15 seconds)
    const ageInSeconds =
      (Date.now() - notification.notifiedAt.getTime()) / 1000;
    if (ageInSeconds > 15) {
      this.logger.warn('Notification expired', {
        notificationId,
        ageInSeconds,
        notifiedAt: notification.notifiedAt,
      });
      throw new BadRequestException({
        error: {
          code: 'NOTIFICATION_EXPIRED',
          message: 'Notification has expired (older than 15 seconds)',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if notification status is PENDING
    if (notification.status !== NotificationStatus.PENDING) {
      this.logger.warn('Notification already responded to', {
        notificationId,
        status: notification.status,
      });
      throw new ConflictException({
        error: {
          code: 'NOTIFICATION_ALREADY_RESPONDED',
          message: 'Notification has already been responded to',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if trip is already assigned
    if (notification.trip.driverId !== null) {
      this.logger.warn('Trip already assigned', {
        notificationId,
        tripId: notification.tripId,
        existingDriverId: notification.trip.driverId,
      });
      throw new ConflictException({
        error: {
          code: 'TRIP_ALREADY_ASSIGNED',
          message: 'This trip has already been accepted by another driver',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Atomic transaction to update notification, trip, and expire other notifications
    const result = await this.prisma.$transaction(async (tx) => {
      // Update notification status to ACCEPTED
      await tx.driverNotification.update({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.ACCEPTED,
          respondedAt: new Date(),
        },
      });

      // Update trip: set driverId, status to DRIVER_ASSIGNED, driverAssignedAt timestamp
      const updatedTrip = await tx.trip.update({
        where: { id: notification.tripId },
        data: {
          driverId,
          status: TripStatus.DRIVER_ASSIGNED,
          driverAssignedAt: new Date(),
        },
      });

      // Update all other pending notifications for this trip to EXPIRED
      await tx.driverNotification.updateMany({
        where: {
          tripId: notification.tripId,
          id: { not: notificationId },
          status: NotificationStatus.PENDING,
        },
        data: {
          status: NotificationStatus.EXPIRED,
        },
      });

      return updatedTrip;
    });

    this.logger.log('Notification accepted, trip assigned', {
      notificationId,
      driverId,
      tripId: notification.tripId,
    });

    // Call DriverService API to update driver status to 'on_trip' (graceful failure)
    try {
      await this.driverServiceClient.updateDriverStatus(driverId, 'on_trip');
      this.logger.log('Driver status updated to on_trip', { driverId });
    } catch (error) {
      this.logger.error('Failed to update driver status', {
        driverId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't fail the transaction
    }

    // Map to DTO and return
    return this.mapTripToDto(result);
  }

  async declineNotification(
    notificationId: string,
    driverId: string,
  ): Promise<void> {
    this.logger.log('Driver declining notification', {
      notificationId,
      driverId,
    });

    // Query notification from database
    const notification = await this.prisma.driverNotification.findUnique({
      where: { id: notificationId },
    });

    // Check if notification exists
    if (!notification) {
      this.logger.warn('Notification not found', { notificationId });
      throw new NotFoundException('Notification not found');
    }

    // Validate notification belongs to authenticated driver
    if (notification.driverId !== driverId) {
      this.logger.warn('Notification does not belong to driver', {
        notificationId,
        notificationDriverId: notification.driverId,
        requestDriverId: driverId,
      });
      throw new ForbiddenException(
        'Notification does not belong to this driver',
      );
    }

    // Check if notification is expired (older than 15 seconds)
    const ageInSeconds =
      (Date.now() - notification.notifiedAt.getTime()) / 1000;
    if (ageInSeconds > 15) {
      this.logger.warn('Notification expired', {
        notificationId,
        ageInSeconds,
        notifiedAt: notification.notifiedAt,
      });
      throw new BadRequestException({
        error: {
          code: 'NOTIFICATION_EXPIRED',
          message: 'Notification has expired (older than 15 seconds)',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Check if notification status is PENDING
    if (notification.status !== NotificationStatus.PENDING) {
      this.logger.warn('Notification already responded to', {
        notificationId,
        status: notification.status,
      });
      throw new ConflictException({
        error: {
          code: 'NOTIFICATION_ALREADY_RESPONDED',
          message: 'Notification has already been responded to',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Update notification status to DECLINED, set respondedAt timestamp
    await this.prisma.driverNotification.update({
      where: { id: notificationId },
      data: {
        status: NotificationStatus.DECLINED,
        respondedAt: new Date(),
      },
    });

    this.logger.log('Notification declined', {
      notificationId,
      driverId,
      tripId: notification.tripId,
    });
  }

  private mapTripToDto(trip: Trip): TripResponseDto {
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
