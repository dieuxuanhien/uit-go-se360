import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { DriverServiceClient } from '../../src/drivers/driver-service.client';
import { TripStatus, NotificationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';

describe('Trip Creation with Driver Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let driverServiceClient: DriverServiceClient;

  beforeAll(async () => {
    const mockGuard = {
      canActivate: (context: any) => {
        const request = context.switchToHttp().getRequest();
        // Mock authenticated user
        request.user = {
          userId: 'test-passenger-id',
          role: 'PASSENGER',
        };
        return true;
      },
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Reflector)
      .useValue(new Reflector())
      .overrideGuard(JwtAuthGuard)
      .useValue(mockGuard)
      .overrideGuard(RolesGuard)
      .useValue(mockGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    driverServiceClient = app.get<DriverServiceClient>(DriverServiceClient);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.driverNotification.deleteMany();
    await prisma.trip.deleteMany();
  });

  describe('POST /trips', () => {
    it('should create trip and notify nearby drivers', async () => {
      // Mock DriverServiceClient to return drivers
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

      jest.spyOn(driverServiceClient, 'searchNearbyDrivers').mockResolvedValue({
        drivers: mockDrivers,
        searchRadius: 5,
        totalFound: 2,
      });

      const createTripDto = {
        pickupLatitude: 10.762622,
        pickupLongitude: 106.660172,
        pickupAddress: 'District 1, Ho Chi Minh City',
        destinationLatitude: 10.823099,
        destinationLongitude: 106.629662,
        destinationAddress: 'Tan Binh District, Ho Chi Minh City',
      };

      const response = await request(app.getHttpServer())
        .post('/trips')
        .send(createTripDto)
        .expect(201);

      expect(response.body).toMatchObject({
        passengerId: expect.any(String),
        status: TripStatus.REQUESTED,
        estimatedFare: expect.any(Number),
      });

      const tripId = response.body.id;

      // Wait a bit for async notification processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify trip status was updated to FINDING_DRIVER
      const trip = await prisma.trip.findUnique({ where: { id: tripId } });
      expect(trip?.status).toBe(TripStatus.FINDING_DRIVER);

      // Verify notification records were created
      const notifications = await prisma.driverNotification.findMany({
        where: { tripId },
      });

      expect(notifications).toHaveLength(2);
      expect(notifications[0]).toMatchObject({
        tripId,
        driverId: 'driver-1',
        status: NotificationStatus.PENDING,
        notifiedAt: expect.any(Date),
      });
      expect(notifications[1]).toMatchObject({
        tripId,
        driverId: 'driver-2',
        status: NotificationStatus.PENDING,
      });

      // Verify DriverServiceClient was called
      expect(driverServiceClient.searchNearbyDrivers).toHaveBeenCalledWith(
        createTripDto.pickupLatitude,
        createTripDto.pickupLongitude,
        5,
        5,
      );
    });

    it('should handle no nearby drivers scenario', async () => {
      // Mock DriverServiceClient to return no drivers
      jest.spyOn(driverServiceClient, 'searchNearbyDrivers').mockResolvedValue({
        drivers: [],
        searchRadius: 15,
        totalFound: 0,
      });

      const createTripDto = {
        pickupLatitude: 10.762622,
        pickupLongitude: 106.660172,
        pickupAddress: 'District 1, Ho Chi Minh City',
        destinationLatitude: 10.823099,
        destinationLongitude: 106.629662,
        destinationAddress: 'Tan Binh District, Ho Chi Minh City',
      };

      const response = await request(app.getHttpServer())
        .post('/trips')
        .send(createTripDto)
        .expect(201);

      const tripId = response.body.id;

      // Wait for async notification processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify trip status is NO_DRIVERS_AVAILABLE
      const trip = await prisma.trip.findUnique({ where: { id: tripId } });
      expect(trip?.status).toBe(TripStatus.NO_DRIVERS_AVAILABLE);

      // Verify no notification records were created
      const notifications = await prisma.driverNotification.findMany({
        where: { tripId },
      });

      expect(notifications).toHaveLength(0);
    });

    it('should handle DriverService unavailability gracefully', async () => {
      // Mock DriverServiceClient to throw ServiceUnavailableException
      jest
        .spyOn(driverServiceClient, 'searchNearbyDrivers')
        .mockRejectedValue(new Error('Service unavailable'));

      const createTripDto = {
        pickupLatitude: 10.762622,
        pickupLongitude: 106.660172,
        pickupAddress: 'District 1, Ho Chi Minh City',
        destinationLatitude: 10.823099,
        destinationLongitude: 106.629662,
        destinationAddress: 'Tan Binh District, Ho Chi Minh City',
      };

      const response = await request(app.getHttpServer())
        .post('/trips')
        .send(createTripDto)
        .expect(201);

      // Trip should still be created despite driver service failure
      expect(response.body).toMatchObject({
        status: TripStatus.REQUESTED,
      });

      const tripId = response.body.id;

      // Wait for async processing
      await new Promise((resolve) => setTimeout(resolve, 100));

      // When driver service consistently fails across all radii,
      // trip status becomes NO_DRIVERS_AVAILABLE (which is reasonable behavior)
      const trip = await prisma.trip.findUnique({ where: { id: tripId } });
      expect(trip?.status).toBe(TripStatus.NO_DRIVERS_AVAILABLE);
    });
  });
});
