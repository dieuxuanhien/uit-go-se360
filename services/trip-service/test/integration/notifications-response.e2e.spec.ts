import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TripStatus, NotificationStatus } from '@prisma/client';

describe('Notifications Response (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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

  describe('POST /notifications/:id/accept', () => {
    const driverId = 'test-driver-id';
    const passengerId = 'test-passenger-id';
    const anotherDriverId = 'another-test-driver-id';

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

      await prisma.user.create({
        data: {
          id: anotherDriverId,
          email: 'another-driver@test.com',
          passwordHash: 'hashed-password',
          role: 'DRIVER',
          firstName: 'Another',
          lastName: 'Driver',
          phoneNumber: '+1234567892',
        },
      });

      // Create an 'other-driver' user for tests that need it
      await prisma.user.create({
        data: {
          id: 'other-driver',
          email: 'other@test.com',
          passwordHash: 'hashed-password',
          role: 'DRIVER',
          firstName: 'Other',
          lastName: 'Driver',
          phoneNumber: '+1234567893',
        },
      });
    });
    const createTestTrip = async (overrides = {}) => {
      return await prisma.trip.create({
        data: {
          passengerId,
          status: TripStatus.FINDING_DRIVER,
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

    it('should accept notification and assign trip when valid driver token provided', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create notification for driver
      const notification = await createTestNotification(trip.id);

      // Create additional pending notifications for same trip (should be expired)
      await createTestNotification(trip.id, { driverId: 'other-driver-1' });
      await createTestNotification(trip.id, { driverId: 'other-driver-2' });

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/accept`)
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(200);

      // Verify response
      expect(response.body).toMatchObject({
        id: trip.id,
        passengerId,
        driverId,
        status: TripStatus.DRIVER_ASSIGNED,
        pickupLatitude: 10.762622,
        pickupLongitude: 106.660172,
        pickupAddress: 'District 1, Ho Chi Minh City',
        destinationLatitude: 10.823099,
        destinationLongitude: 106.629662,
        destinationAddress: 'Tan Binh District, Ho Chi Minh City',
        estimatedFare: 2500,
      });
      expect(response.body.driverAssignedAt).toBeDefined();

      // Verify database state
      const updatedTrip = await prisma.trip.findUnique({
        where: { id: trip.id },
      });
      expect(updatedTrip?.driverId).toBe(driverId);
      expect(updatedTrip?.status).toBe(TripStatus.DRIVER_ASSIGNED);
      expect(updatedTrip?.driverAssignedAt).toBeDefined();

      // Verify notification status
      const updatedNotification = await prisma.driverNotification.findUnique({
        where: { id: notification.id },
      });
      expect(updatedNotification?.status).toBe(NotificationStatus.ACCEPTED);
      expect(updatedNotification?.respondedAt).toBeDefined();

      // Verify other notifications expired
      const otherNotifications = await prisma.driverNotification.findMany({
        where: {
          tripId: trip.id,
          id: { not: notification.id },
        },
      });
      expect(otherNotifications).toHaveLength(2);
      expect(
        otherNotifications.every(
          (n) => n.status === NotificationStatus.EXPIRED,
        ),
      ).toBe(true);
    });

    it('should return 400 when notification is expired', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create expired notification
      const notification = await createTestNotification(trip.id, {
        notifiedAt: new Date(Date.now() - 20000), // 20 seconds ago
      });

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/accept`)
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(400);

      expect(response.body.error.code).toBe('NOTIFICATION_EXPIRED');
    });

    it('should return 409 when notification already responded', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create accepted notification
      const notification = await createTestNotification(trip.id, {
        status: NotificationStatus.ACCEPTED,
      });

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/accept`)
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(409);

      expect(response.body.error.code).toBe('NOTIFICATION_ALREADY_RESPONDED');
    });

    it('should return 409 when trip already assigned by another driver', async () => {
      // Create test trip already assigned
      const trip = await createTestTrip({
        driverId: 'other-driver',
        status: TripStatus.DRIVER_ASSIGNED,
      });

      // Create pending notification
      const notification = await createTestNotification(trip.id);

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/accept`)
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(409);

      expect(response.body.error.code).toBe('TRIP_ALREADY_ASSIGNED');
    });

    it('should return 401 when no authorization header provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/notifications/some-id/accept')
        .expect(401);
    });

    it('should return 403 when passenger tries to accept notification', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create notification
      const notification = await createTestNotification(trip.id);

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/accept`)
        .set('Authorization', `Bearer ${mockPassengerJwt()}`)
        .expect(403);
    });

    it('should return 403 when wrong driver tries to accept notification', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create notification for different driver
      const notification = await createTestNotification(trip.id, {
        driverId: 'different-driver-id',
      });

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/accept`)
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(403);
    });

    it('should return 404 when notification not found', async () => {
      const response = await request(app.getHttpServer())
        .post('/notifications/non-existent-id/accept')
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(404);
    });
  });

  describe('POST /notifications/:id/decline', () => {
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
          status: TripStatus.FINDING_DRIVER,
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

    it('should decline notification successfully', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create notification
      const notification = await createTestNotification(trip.id);

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/decline`)
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(200);

      expect(response.body).toMatchObject({
        message: 'Notification declined successfully',
        notificationId: notification.id,
        status: 'DECLINED',
      });

      // Verify database state
      const updatedNotification = await prisma.driverNotification.findUnique({
        where: { id: notification.id },
      });
      expect(updatedNotification?.status).toBe(NotificationStatus.DECLINED);
      expect(updatedNotification?.respondedAt).toBeDefined();

      // Verify trip status remains unchanged
      const updatedTrip = await prisma.trip.findUnique({
        where: { id: trip.id },
      });
      expect(updatedTrip?.status).toBe(TripStatus.FINDING_DRIVER);
      expect(updatedTrip?.driverId).toBeNull();
    });

    it('should return 400 when notification is expired', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create expired notification
      const notification = await createTestNotification(trip.id, {
        notifiedAt: new Date(Date.now() - 20000), // 20 seconds ago
      });

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/decline`)
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(400);

      expect(response.body.error.code).toBe('NOTIFICATION_EXPIRED');
    });

    it('should return 409 when notification already responded', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create declined notification
      const notification = await createTestNotification(trip.id, {
        status: NotificationStatus.DECLINED,
      });

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/decline`)
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(409);

      expect(response.body.error.code).toBe('NOTIFICATION_ALREADY_RESPONDED');
    });

    it('should return 401 when no authorization header provided', async () => {
      const response = await request(app.getHttpServer())
        .post('/notifications/some-id/decline')
        .expect(401);
    });

    it('should return 403 when passenger tries to decline notification', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create notification
      const notification = await createTestNotification(trip.id);

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/decline`)
        .set('Authorization', `Bearer ${mockPassengerJwt()}`)
        .expect(403);
    });

    it('should return 403 when wrong driver tries to decline notification', async () => {
      // Create test trip
      const trip = await createTestTrip();

      // Create notification for different driver
      const notification = await createTestNotification(trip.id, {
        driverId: 'different-driver-id',
      });

      const response = await request(app.getHttpServer())
        .post(`/notifications/${notification.id}/decline`)
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(403);
    });

    it('should return 404 when notification not found', async () => {
      const response = await request(app.getHttpServer())
        .post('/notifications/non-existent-id/decline')
        .set('Authorization', `Bearer ${mockDriverJwt()}`)
        .expect(404);
    });
  });
});
