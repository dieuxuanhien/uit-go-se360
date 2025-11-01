import { Test, TestingModule } from '@nestjs/testing';
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
    },
    driverNotification: {
      createMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockDriverServiceClient = {
    searchNearbyDrivers: jest.fn(),
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
});
