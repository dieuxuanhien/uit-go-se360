import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { TripStatus, NotificationStatus } from '@prisma/client';
import { DriverNotificationService } from '../../../src/notifications/driver-notification.service';
import { PrismaService } from '../../../src/prisma/prisma.service';
import { DriverServiceClient } from '../../../src/drivers/driver-service.client';
import driverNotificationConfig from '../../../src/config/driver-notification.config';

describe('DriverNotificationService', () => {
  let service: DriverNotificationService;
  let _prismaService: PrismaService;
  let driverServiceClient: DriverServiceClient;

  const mockConfig = {
    searchRadii: { initial: 5, second: 10, final: 15 },
    notificationLimit: 5,
  };

  const mockPrismaService = {
    trip: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    driverNotification: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockDriverServiceClient = {
    searchNearbyDrivers: jest.fn(),
    updateDriverStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriverNotificationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: DriverServiceClient,
          useValue: mockDriverServiceClient,
        },
        {
          provide: driverNotificationConfig.KEY,
          useValue: mockConfig,
        },
      ],
    }).compile();

    service = module.get<DriverNotificationService>(DriverNotificationService);
    _prismaService = module.get<PrismaService>(PrismaService);
    driverServiceClient = module.get<DriverServiceClient>(DriverServiceClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findAndNotifyDrivers', () => {
    const tripId = 'trip-123';
    const pickupLatitude = 10.762622;
    const pickupLongitude = 106.660172;

    it('should find drivers at initial 5km radius and create notifications', async () => {
      const mockDrivers = [
        {
          driverId: 'driver-1',
          latitude: 10.762,
          longitude: 106.66,
          distance: 1.5,
        },
        {
          driverId: 'driver-2',
          latitude: 10.763,
          longitude: 106.661,
          distance: 2.0,
        },
      ];

      mockDriverServiceClient.searchNearbyDrivers.mockResolvedValue({
        drivers: mockDrivers,
        searchRadius: 5,
        totalFound: 2,
      });

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback({
          driverNotification: mockPrismaService.driverNotification,
          trip: mockPrismaService.trip,
        });
      });

      const result = await service.findAndNotifyDrivers(
        tripId,
        pickupLatitude,
        pickupLongitude,
      );

      expect(result.driversNotified).toBe(2);
      expect(driverServiceClient.searchNearbyDrivers).toHaveBeenCalledWith(
        pickupLatitude,
        pickupLongitude,
        5,
        5,
      );
      expect(
        mockPrismaService.driverNotification.createMany,
      ).toHaveBeenCalledWith({
        data: mockDrivers.map((driver) => ({
          tripId,
          driverId: driver.driverId,
          status: NotificationStatus.PENDING,
          notifiedAt: expect.any(Date),
        })),
      });
      expect(mockPrismaService.trip.update).toHaveBeenCalledWith({
        where: { id: tripId },
        data: { status: TripStatus.FINDING_DRIVER },
      });
    });

    it('should expand to 10km when initial 5km search finds no drivers', async () => {
      mockDriverServiceClient.searchNearbyDrivers
        .mockResolvedValueOnce({ drivers: [], searchRadius: 5, totalFound: 0 })
        .mockResolvedValueOnce({
          drivers: [
            {
              driverId: 'driver-1',
              latitude: 10.77,
              longitude: 106.67,
              distance: 8.0,
            },
          ],
          searchRadius: 10,
          totalFound: 1,
        });

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback({
          driverNotification: mockPrismaService.driverNotification,
          trip: mockPrismaService.trip,
        });
      });

      const result = await service.findAndNotifyDrivers(
        tripId,
        pickupLatitude,
        pickupLongitude,
      );

      expect(result.driversNotified).toBe(1);
      expect(driverServiceClient.searchNearbyDrivers).toHaveBeenCalledTimes(2);
      expect(driverServiceClient.searchNearbyDrivers).toHaveBeenNthCalledWith(
        1,
        pickupLatitude,
        pickupLongitude,
        5,
        5,
      );
      expect(driverServiceClient.searchNearbyDrivers).toHaveBeenNthCalledWith(
        2,
        pickupLatitude,
        pickupLongitude,
        10,
        5,
      );
    });

    it('should set trip status to NO_DRIVERS_AVAILABLE when all radii fail', async () => {
      mockDriverServiceClient.searchNearbyDrivers.mockResolvedValue({
        drivers: [],
        searchRadius: 15,
        totalFound: 0,
      });

      const result = await service.findAndNotifyDrivers(
        tripId,
        pickupLatitude,
        pickupLongitude,
      );

      expect(result.driversNotified).toBe(0);
      expect(driverServiceClient.searchNearbyDrivers).toHaveBeenCalledTimes(3);
      expect(mockPrismaService.trip.update).toHaveBeenCalledWith({
        where: { id: tripId },
        data: { status: TripStatus.NO_DRIVERS_AVAILABLE },
      });
    });

    it('should only notify first 5 drivers when more than 5 are found', async () => {
      const mockDrivers = Array.from({ length: 8 }, (_, i) => ({
        driverId: `driver-${i + 1}`,
        latitude: 10.762 + i * 0.001,
        longitude: 106.66 + i * 0.001,
        distance: 1.0 + i * 0.5,
      }));

      mockDriverServiceClient.searchNearbyDrivers.mockResolvedValue({
        drivers: mockDrivers,
        searchRadius: 5,
        totalFound: 8,
      });

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback({
          driverNotification: mockPrismaService.driverNotification,
          trip: mockPrismaService.trip,
        });
      });

      const result = await service.findAndNotifyDrivers(
        tripId,
        pickupLatitude,
        pickupLongitude,
      );

      expect(result.driversNotified).toBe(5);
      expect(
        mockPrismaService.driverNotification.createMany,
      ).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            tripId,
            status: NotificationStatus.PENDING,
          }),
        ]),
      });
      const createManyCall =
        mockPrismaService.driverNotification.createMany.mock.calls[0][0];
      expect(createManyCall.data).toHaveLength(5);
    });

    it('should create notification records with correct fields', async () => {
      const mockDrivers = [
        {
          driverId: 'driver-1',
          latitude: 10.762,
          longitude: 106.66,
          distance: 1.5,
        },
      ];

      mockDriverServiceClient.searchNearbyDrivers.mockResolvedValue({
        drivers: mockDrivers,
        searchRadius: 5,
        totalFound: 1,
      });

      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback({
          driverNotification: mockPrismaService.driverNotification,
          trip: mockPrismaService.trip,
        });
      });

      await service.findAndNotifyDrivers(
        tripId,
        pickupLatitude,
        pickupLongitude,
      );

      expect(
        mockPrismaService.driverNotification.createMany,
      ).toHaveBeenCalledWith({
        data: [
          {
            tripId,
            driverId: 'driver-1',
            status: NotificationStatus.PENDING,
            notifiedAt: expect.any(Date),
          },
        ],
      });
    });

    it('should throw error if transaction fails', async () => {
      const mockDrivers = [
        {
          driverId: 'driver-1',
          latitude: 10.762,
          longitude: 106.66,
          distance: 1.5,
        },
      ];

      mockDriverServiceClient.searchNearbyDrivers.mockResolvedValue({
        drivers: mockDrivers,
        searchRadius: 5,
        totalFound: 1,
      });

      const transactionError = new Error('Transaction failed');
      mockPrismaService.$transaction.mockRejectedValue(transactionError);

      await expect(
        service.findAndNotifyDrivers(tripId, pickupLatitude, pickupLongitude),
      ).rejects.toThrow('Transaction failed');
    });
  });

  describe('getDriverNotifications', () => {
    const driverId = 'driver-123';

    it('should return 2 pending notifications within 15 seconds', async () => {
      const now = new Date();
      const tenSecondsAgo = new Date(now.getTime() - 10000);
      const fiveSecondsAgo = new Date(now.getTime() - 5000);

      const mockNotifications = [
        {
          id: 'notif-1',
          tripId: 'trip-1',
          driverId,
          status: NotificationStatus.PENDING,
          notifiedAt: tenSecondsAgo,
          trip: {
            pickupLatitude: 10.762622,
            pickupLongitude: 106.660172,
            pickupAddress: 'Pickup 1',
            destinationLatitude: 10.823099,
            destinationLongitude: 106.629662,
            destinationAddress: 'Dest 1',
            estimatedFare: 2500,
          },
        },
        {
          id: 'notif-2',
          tripId: 'trip-2',
          driverId,
          status: NotificationStatus.PENDING,
          notifiedAt: fiveSecondsAgo,
          trip: {
            pickupLatitude: 10.77,
            pickupLongitude: 106.67,
            pickupAddress: 'Pickup 2',
            destinationLatitude: 10.82,
            destinationLongitude: 106.63,
            destinationAddress: 'Dest 2',
            estimatedFare: 3000,
          },
        },
      ];

      mockPrismaService.driverNotification.findMany.mockResolvedValue(
        mockNotifications,
      );

      const result = await service.getDriverNotifications(driverId);

      expect(result).toHaveLength(2);
      expect(result[0].notificationId).toBe('notif-1');
      expect(result[0].timeRemainingSeconds).toBe(5); // 15 - 10
      expect(result[1].notificationId).toBe('notif-2');
      expect(result[1].timeRemainingSeconds).toBe(10); // 15 - 5
      expect(
        mockPrismaService.driverNotification.findMany,
      ).toHaveBeenCalledWith({
        where: {
          driverId,
          status: NotificationStatus.PENDING,
          notifiedAt: {
            gte: expect.any(Date),
          },
        },
        include: {
          trip: true,
        },
        orderBy: {
          notifiedAt: 'asc',
        },
      });
    });

    it('should filter out notifications older than 15 seconds', async () => {
      const now = new Date();
      const twentySecondsAgo = new Date(now.getTime() - 20000);

      const mockNotifications = [
        {
          id: 'notif-1',
          tripId: 'trip-1',
          driverId,
          status: NotificationStatus.PENDING,
          notifiedAt: twentySecondsAgo,
          trip: {
            pickupLatitude: 10.762622,
            pickupLongitude: 106.660172,
            pickupAddress: 'Pickup 1',
            destinationLatitude: 10.823099,
            destinationLongitude: 106.629662,
            destinationAddress: 'Dest 1',
            estimatedFare: 2500,
          },
        },
      ];

      mockPrismaService.driverNotification.findMany.mockResolvedValue(
        mockNotifications,
      );

      const result = await service.getDriverNotifications(driverId);

      expect(result).toHaveLength(0);
    });

    it('should return only PENDING notifications', async () => {
      const now = new Date();
      const fiveSecondsAgo = new Date(now.getTime() - 5000);

      const mockNotifications = [
        {
          id: 'notif-1',
          tripId: 'trip-1',
          driverId,
          status: NotificationStatus.PENDING,
          notifiedAt: fiveSecondsAgo,
          trip: {
            pickupLatitude: 10.762622,
            pickupLongitude: 106.660172,
            pickupAddress: 'Pickup 1',
            destinationLatitude: 10.823099,
            destinationLongitude: 106.629662,
            destinationAddress: 'Dest 1',
            estimatedFare: 2500,
          },
        },
      ];

      mockPrismaService.driverNotification.findMany.mockResolvedValue(
        mockNotifications,
      );

      const result = await service.getDriverNotifications(driverId);

      expect(result).toHaveLength(1);
      expect(result[0].notificationId).toBe('notif-1');
    });

    it('should sort notifications by notifiedAt ascending', async () => {
      const now = new Date();
      const tenSecondsAgo = new Date(now.getTime() - 10000);
      const fiveSecondsAgo = new Date(now.getTime() - 5000);

      const mockNotifications = [
        {
          id: 'notif-1',
          tripId: 'trip-1',
          driverId,
          status: NotificationStatus.PENDING,
          notifiedAt: tenSecondsAgo,
          trip: {
            pickupLatitude: 10.762622,
            pickupLongitude: 106.660172,
            pickupAddress: 'Pickup 1',
            destinationLatitude: 10.823099,
            destinationLongitude: 106.629662,
            destinationAddress: 'Dest 1',
            estimatedFare: 2500,
          },
        },
        {
          id: 'notif-2',
          tripId: 'trip-2',
          driverId,
          status: NotificationStatus.PENDING,
          notifiedAt: fiveSecondsAgo,
          trip: {
            pickupLatitude: 10.77,
            pickupLongitude: 106.67,
            pickupAddress: 'Pickup 2',
            destinationLatitude: 10.82,
            destinationLongitude: 106.63,
            destinationAddress: 'Dest 2',
            estimatedFare: 3000,
          },
        },
      ];

      mockPrismaService.driverNotification.findMany.mockResolvedValue(
        mockNotifications,
      );

      const result = await service.getDriverNotifications(driverId);

      expect(result).toHaveLength(2);
      expect(result[0].notificationId).toBe('notif-1'); // older first
      expect(result[1].notificationId).toBe('notif-2');
    });

    it('should return empty array when no notifications', async () => {
      mockPrismaService.driverNotification.findMany.mockResolvedValue([]);

      const result = await service.getDriverNotifications(driverId);

      expect(result).toHaveLength(0);
    });
  });

  describe('acceptNotification', () => {
    const notificationId = 'notif-123';
    const driverId = 'driver-123';
    const tripId = 'trip-123';

    it('should accept valid notification and assign trip', async () => {
      const now = new Date();
      const fiveSecondsAgo = new Date(now.getTime() - 5000);

      const mockNotification = {
        id: notificationId,
        tripId,
        driverId,
        status: NotificationStatus.PENDING,
        notifiedAt: fiveSecondsAgo,
        trip: {
          id: tripId,
          driverId: null,
          status: TripStatus.FINDING_DRIVER,
        },
      };

      const updatedTrip = {
        id: tripId,
        driverId,
        status: TripStatus.DRIVER_ASSIGNED,
        driverAssignedAt: now,
      };

      mockPrismaService.driverNotification.findUnique.mockResolvedValue(
        mockNotification,
      );
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback({
          driverNotification: mockPrismaService.driverNotification,
          trip: mockPrismaService.trip,
        });
      });
      mockPrismaService.trip.update.mockResolvedValue(updatedTrip);
      mockDriverServiceClient.updateDriverStatus.mockResolvedValue(undefined);

      const result = await service.acceptNotification(notificationId, driverId);

      expect(result.id).toBe(tripId);
      expect(result.driverId).toBe(driverId);
      expect(result.status).toBe(TripStatus.DRIVER_ASSIGNED);
      expect(
        mockPrismaService.driverNotification.findUnique,
      ).toHaveBeenCalledWith({
        where: { id: notificationId },
        include: { trip: true },
      });
      expect(mockPrismaService.driverNotification.update).toHaveBeenCalledWith({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.ACCEPTED,
          respondedAt: expect.any(Date),
        },
      });
      expect(mockPrismaService.trip.update).toHaveBeenCalledWith({
        where: { id: tripId },
        data: {
          driverId,
          status: TripStatus.DRIVER_ASSIGNED,
          driverAssignedAt: expect.any(Date),
        },
      });
      expect(
        mockPrismaService.driverNotification.updateMany,
      ).toHaveBeenCalledWith({
        where: {
          tripId,
          id: { not: notificationId },
          status: NotificationStatus.PENDING,
        },
        data: {
          status: NotificationStatus.EXPIRED,
        },
      });
      expect(mockDriverServiceClient.updateDriverStatus).toHaveBeenCalledWith(
        driverId,
        'on_trip',
      );
    });

    it('should throw NotFoundException if notification not found', async () => {
      mockPrismaService.driverNotification.findUnique.mockResolvedValue(null);

      await expect(
        service.acceptNotification(notificationId, driverId),
      ).rejects.toThrow('Notification not found');
    });

    it('should throw ForbiddenException if notification belongs to different driver', async () => {
      const mockNotification = {
        id: notificationId,
        tripId,
        driverId: 'different-driver',
        status: NotificationStatus.PENDING,
        notifiedAt: new Date(),
        trip: { id: tripId, driverId: null },
      };

      mockPrismaService.driverNotification.findUnique.mockResolvedValue(
        mockNotification,
      );

      await expect(
        service.acceptNotification(notificationId, driverId),
      ).rejects.toThrow('Notification does not belong to this driver');
    });

    it('should throw BadRequestException if notification expired', async () => {
      const twentySecondsAgo = new Date(Date.now() - 20000);

      const mockNotification = {
        id: notificationId,
        tripId,
        driverId,
        status: NotificationStatus.PENDING,
        notifiedAt: twentySecondsAgo,
        trip: { id: tripId, driverId: null },
      };

      mockPrismaService.driverNotification.findUnique.mockResolvedValue(
        mockNotification,
      );

      await expect(
        service.acceptNotification(notificationId, driverId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if notification already responded', async () => {
      const mockNotification = {
        id: notificationId,
        tripId,
        driverId,
        status: NotificationStatus.ACCEPTED,
        notifiedAt: new Date(),
        trip: { id: tripId, driverId: null },
      };

      mockPrismaService.driverNotification.findUnique.mockResolvedValue(
        mockNotification,
      );

      await expect(
        service.acceptNotification(notificationId, driverId),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException if trip already assigned', async () => {
      const mockNotification = {
        id: notificationId,
        tripId,
        driverId,
        status: NotificationStatus.PENDING,
        notifiedAt: new Date(),
        trip: { id: tripId, driverId: 'other-driver' },
      };

      mockPrismaService.driverNotification.findUnique.mockResolvedValue(
        mockNotification,
      );

      await expect(
        service.acceptNotification(notificationId, driverId),
      ).rejects.toThrow(ConflictException);
    });

    it('should continue if DriverService update fails', async () => {
      const now = new Date();
      const fiveSecondsAgo = new Date(now.getTime() - 5000);

      const mockNotification = {
        id: notificationId,
        tripId,
        driverId,
        status: NotificationStatus.PENDING,
        notifiedAt: fiveSecondsAgo,
        trip: {
          id: tripId,
          driverId: null,
          status: TripStatus.FINDING_DRIVER,
        },
      };

      const updatedTrip = {
        id: tripId,
        driverId,
        status: TripStatus.DRIVER_ASSIGNED,
        driverAssignedAt: now,
      };

      mockPrismaService.driverNotification.findUnique.mockResolvedValue(
        mockNotification,
      );
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return await callback({
          driverNotification: mockPrismaService.driverNotification,
          trip: mockPrismaService.trip,
        });
      });
      mockPrismaService.trip.update.mockResolvedValue(updatedTrip);
      mockDriverServiceClient.updateDriverStatus.mockRejectedValue(
        new Error('DriverService error'),
      );

      const result = await service.acceptNotification(notificationId, driverId);

      expect(result.id).toBe(tripId);
      expect(mockDriverServiceClient.updateDriverStatus).toHaveBeenCalledWith(
        driverId,
        'on_trip',
      );
    });
  });

  describe('declineNotification', () => {
    const notificationId = 'notif-123';
    const driverId = 'driver-123';
    const tripId = 'trip-123';

    it('should decline valid notification', async () => {
      const fiveSecondsAgo = new Date(Date.now() - 5000);

      const mockNotification = {
        id: notificationId,
        tripId,
        driverId,
        status: NotificationStatus.PENDING,
        notifiedAt: fiveSecondsAgo,
      };

      mockPrismaService.driverNotification.findUnique.mockResolvedValue(
        mockNotification,
      );

      await service.declineNotification(notificationId, driverId);

      expect(
        mockPrismaService.driverNotification.findUnique,
      ).toHaveBeenCalledWith({
        where: { id: notificationId },
      });
      expect(mockPrismaService.driverNotification.update).toHaveBeenCalledWith({
        where: { id: notificationId },
        data: {
          status: NotificationStatus.DECLINED,
          respondedAt: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException if notification not found', async () => {
      mockPrismaService.driverNotification.findUnique.mockResolvedValue(null);

      await expect(
        service.declineNotification(notificationId, driverId),
      ).rejects.toThrow('Notification not found');
    });

    it('should throw ForbiddenException if notification belongs to different driver', async () => {
      const mockNotification = {
        id: notificationId,
        tripId,
        driverId: 'different-driver',
        status: NotificationStatus.PENDING,
        notifiedAt: new Date(),
      };

      mockPrismaService.driverNotification.findUnique.mockResolvedValue(
        mockNotification,
      );

      await expect(
        service.declineNotification(notificationId, driverId),
      ).rejects.toThrow('Notification does not belong to this driver');
    });

    it('should throw BadRequestException if notification expired', async () => {
      const twentySecondsAgo = new Date(Date.now() - 20000);

      const mockNotification = {
        id: notificationId,
        tripId,
        driverId,
        status: NotificationStatus.PENDING,
        notifiedAt: twentySecondsAgo,
      };

      mockPrismaService.driverNotification.findUnique.mockResolvedValue(
        mockNotification,
      );

      await expect(
        service.declineNotification(notificationId, driverId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw ConflictException if notification already responded', async () => {
      const mockNotification = {
        id: notificationId,
        tripId,
        driverId,
        status: NotificationStatus.DECLINED,
        notifiedAt: new Date(),
      };

      mockPrismaService.driverNotification.findUnique.mockResolvedValue(
        mockNotification,
      );

      await expect(
        service.declineNotification(notificationId, driverId),
      ).rejects.toThrow(ConflictException);
    });
  });
});
