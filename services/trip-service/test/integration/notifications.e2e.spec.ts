import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TripStatus, NotificationStatus } from '@prisma/client';

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(Reflector)
      .useValue(new Reflector())
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Clean up any leftover data from failed tests
    try {
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "driver_notifications" CASCADE`,
      );
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "trips" CASCADE`);
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE`);
    } catch (error) {
      // Ignore errors during initial cleanup
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  describe('GET /notifications', () => {
    const driverId = 'test-driver-id';
    const passengerId = 'test-passenger-id';

    beforeEach(async () => {
      // Clean up first to ensure fresh state using TRUNCATE CASCADE
      await prisma.$executeRawUnsafe(
        `TRUNCATE TABLE "driver_notifications" CASCADE`,
      );
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "trips" CASCADE`);
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "users" CASCADE`);

      // Create test users
      await prisma.user.create({
        data: {
          id: passengerId,
          email: 'passenger@test.com',
          passwordHash: 'hashed-password',
          role: 'PASSENGER',
          firstName: 'Test',
          lastName: 'Passenger',
          phoneNumber: '+1234567890',
        },
      });

      await prisma.user.create({
        data: {
          id: driverId,
          email: 'driver@test.com',
          passwordHash: 'hashed-password',
          role: 'DRIVER',
          firstName: 'Test',
          lastName: 'Driver',
          phoneNumber: '+1234567891',
        },
      });
    });
    const createTestTrip = async (overrides = {}) => {
      return await prisma.trip.create({
        data: {
          passengerId,
          status: TripStatus.REQUESTED,
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'District 1, Ho Chi Minh City',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Tan Binh District, Ho Chi Minh City',
          estimatedFare: 2500,
          estimatedDistance: 8.5,
          ...overrides,
        },
      });
    };

    const createTestNotification = async (tripId: string, overrides = {}) => {
      return await prisma.driverNotification.create({
        data: {
          tripId,
          driverId,
          status: NotificationStatus.PENDING,
          notifiedAt: new Date(),
          ...overrides,
        },
      });
    };

    const mockDriverJwt = () => {
      // Create a mock JWT payload for driver
      const payload = {
        userId: driverId,
        role: 'DRIVER',
        email: 'driver@test.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const header = { alg: 'HS256', typ: 'JWT' };
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
        'base64url',
      );
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
        'base64url',
      );
      const signature = 'mock-signature'; // Mock signature
      return `${encodedHeader}.${encodedPayload}.${signature}`;
    };

    const mockPassengerJwt = () => {
      // Create a mock JWT payload for passenger
      const payload = {
        userId: passengerId,
        role: 'PASSENGER',
        email: 'passenger@test.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };
      const header = { alg: 'HS256', typ: 'JWT' };
      const encodedHeader = Buffer.from(JSON.stringify(header)).toString(
        'base64url',
      );
      const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
        'base64url',
      );
      const signature = 'mock-signature'; // Mock signature
      return `${encodedHeader}.${encodedPayload}.${signature}`;
    };

    it('should return pending notifications for authenticated driver', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create recent notification (within 15 seconds)
      const recentNotification = await createTestNotification(trip.id, {
        notifiedAt: new Date(Date.now() - 5000), // 5 seconds ago
      });

      // Create another recent notification
      const anotherTrip = await createTestTrip();
      const anotherNotification = await createTestNotification(anotherTrip.id, {
        notifiedAt: new Date(Date.now() - 3000), // 3 seconds ago
      });

      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(200);

      expect(response.body).toHaveLength(2);

      // Should be sorted by notifiedAt ascending (oldest first)
      expect(response.body[0].notificationId).toBe(recentNotification.id);
      expect(response.body[0].timeRemainingSeconds).toBe(10); // 15 - 5
      expect(response.body[0]).toMatchObject({
        tripId: trip.id,
        pickupLatitude: 10.762622,
        pickupLongitude: 106.660172,
        pickupAddress: 'District 1, Ho Chi Minh City',
        destinationLatitude: 10.823099,
        destinationLongitude: 106.629662,
        destinationAddress: 'Tan Binh District, Ho Chi Minh City',
        estimatedFare: 2500,
        notifiedAt: recentNotification.notifiedAt.toISOString(),
      });

      expect(response.body[1].notificationId).toBe(anotherNotification.id);
      expect(response.body[1].timeRemainingSeconds).toBe(12); // 15 - 3
    });

    it('should filter out expired notifications (older than 15 seconds)', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create recent notification
      await createTestNotification(trip.id, {
        notifiedAt: new Date(Date.now() - 5000), // 5 seconds ago
      });

      // Create expired notification
      await createTestNotification(trip.id, {
        driverId: 'another-driver',
        notifiedAt: new Date(Date.now() - 20000), // 20 seconds ago
      });

      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(200);

      // Should only return the recent notification
      expect(response.body).toHaveLength(1);
      expect(response.body[0].timeRemainingSeconds).toBe(10);
    });

    it('should return only PENDING notifications', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create PENDING notification
      await createTestNotification(trip.id, {
        status: NotificationStatus.PENDING,
      });

      // Create ACCEPTED notification
      await createTestNotification(trip.id, {
        driverId: 'another-driver',
        status: NotificationStatus.ACCEPTED,
      });

      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(200);

      // Should only return PENDING notification
      expect(response.body).toHaveLength(1);
      expect(response.body[0].status).toBeUndefined(); // Not exposed in DTO
    });

    it('should return empty array when driver has no notifications', async () => {
      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return 401 when no authorization header provided', async () => {
      const response = await request(app.getHttpServer())
        .get('/notifications')
        .expect(401);

      expect(response.body.message).toBe('Missing authentication token');
    });

    it('should return 403 when passenger tries to access driver endpoint', async () => {
      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${mockPassengerJwt()}`)
        .expect(403);

      expect(response.body.message).toBe('Insufficient permissions');
    });

    it('should only return notifications for the authenticated driver', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create notification for our driver
      await createTestNotification(trip.id);

      // Create notification for another driver
      await createTestNotification(trip.id, {
        driverId: 'another-driver-id',
      });

      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(200);

      // Should only return notification for authenticated driver
      expect(response.body).toHaveLength(1);
      expect(response.body[0].tripId).toBe(trip.id);
    });
  });
});
