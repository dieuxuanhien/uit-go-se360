import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TripStatus, NotificationStatus } from '@prisma/client';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { RolesGuard } from '../../src/common/guards/roles.guard';

describe('Notifications (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Mock guard to simulate JWT authentication and role checking
  const mockGuard = {
    canActivate: (context: any) => {
      const request = context.switchToHttp().getRequest();
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedException('Missing authentication token');
      }
      const token = authHeader.substring(7);
      try {
        const parts = token.split('.');
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
        request.user = {
          userId: payload.userId,
          role: payload.role,
        };
        if (payload.role !== 'DRIVER') {
          return false; // Forbidden
        }
        return true;
      } catch {
        throw new UnauthorizedException('Invalid token');
      }
    },
  };

  // Generate test JWT tokens
  const generateToken = (userId: string, role: string) => {
    const payload = JSON.stringify({
      userId,
      role,
      email: `${role.toLowerCase()}@test.com`,
    });
    const header = Buffer.from(
      JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
    ).toString('base64');
    const encodedPayload = Buffer.from(payload).toString('base64');
    const signature = 'test-signature';
    return `${header}.${encodedPayload}.${signature}`;
  };

  const driverToken = generateToken('driver-123', 'DRIVER');
  const passengerToken = generateToken('passenger-456', 'PASSENGER');

  beforeAll(async () => {
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
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean tables before each test
    await prisma.driverNotification.deleteMany({});
    await prisma.trip.deleteMany({});
    await prisma.user.deleteMany({});

    // Create test users
    await prisma.user.createMany({
      data: [
        {
          id: 'passenger-456',
          email: 'passenger@test.com',
          role: 'PASSENGER',
          firstName: 'Test',
          lastName: 'Passenger',
          phoneNumber: '+1234567890',
          passwordHash: 'hashed-password',
        },
        {
          id: 'driver-123',
          email: 'driver@test.com',
          role: 'DRIVER',
          firstName: 'Test',
          lastName: 'Driver',
          phoneNumber: '+0987654321',
          passwordHash: 'hashed-password',
        },
        {
          id: 'driver-789',
          email: 'driver2@test.com',
          role: 'DRIVER',
          firstName: 'Test2',
          lastName: 'Driver',
          phoneNumber: '+1122334455',
          passwordHash: 'hashed-password',
        },
      ],
    });
  });

  describe('GET /notifications', () => {
    it('should return 200 with pending notifications for driver', async () => {
      const now = new Date();
      const fiveSecondsAgo = new Date(now.getTime() - 5000);
      const tenSecondsAgo = new Date(now.getTime() - 10000);

      // Create test trip
      const trip = await prisma.trip.create({
        data: {
          id: 'trip-123',
          passengerId: 'passenger-456',
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'Pickup Address',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Destination Address',
          estimatedFare: 2500,
          estimatedDistance: 1000,
          status: TripStatus.FINDING_DRIVER,
        },
      });

      // Create driver notifications
      await prisma.driverNotification.createMany({
        data: [
          {
            id: 'notif-1',
            tripId: trip.id,
            driverId: 'driver-123',
            status: NotificationStatus.PENDING,
            notifiedAt: tenSecondsAgo,
          },
          {
            id: 'notif-2',
            tripId: trip.id,
            driverId: 'driver-123',
            status: NotificationStatus.PENDING,
            notifiedAt: fiveSecondsAgo,
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].notificationId).toBe('notif-1');
      expect(response.body[0].timeRemainingSeconds).toBe(5); // 15 - 10
      expect(response.body[1].notificationId).toBe('notif-2');
      expect(response.body[1].timeRemainingSeconds).toBe(10); // 15 - 5
      expect(response.body[0].tripId).toBe(trip.id);
      expect(response.body[0].pickupLatitude).toBe(10.762622);
    });

    it('should return 401 without token', async () => {
      await request(app.getHttpServer()).get('/notifications').expect(401);
    });

    it('should return 403 for passenger token', async () => {
      await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(403);
    });

    it('should return empty array when driver has no notifications', async () => {
      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should filter out expired notifications', async () => {
      const now = new Date();
      const twentySecondsAgo = new Date(now.getTime() - 20000);

      const trip = await prisma.trip.create({
        data: {
          id: 'trip-123',
          passengerId: 'passenger-456',
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'Pickup Address',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Destination Address',
          estimatedFare: 2500,
          estimatedDistance: 1000,
          status: TripStatus.FINDING_DRIVER,
        },
      });

      await prisma.driverNotification.create({
        data: {
          id: 'notif-1',
          tripId: trip.id,
          driverId: 'driver-123',
          status: NotificationStatus.PENDING,
          notifiedAt: twentySecondsAgo,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body).toHaveLength(0);
    });

    it('should only return notifications for the authenticated driver', async () => {
      const now = new Date();
      const fiveSecondsAgo = new Date(now.getTime() - 5000);

      const trip = await prisma.trip.create({
        data: {
          id: 'trip-123',
          passengerId: 'passenger-456',
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'Pickup Address',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Destination Address',
          estimatedFare: 2500,
          estimatedDistance: 1000,
          status: TripStatus.FINDING_DRIVER,
        },
      });

      // Create notification for driver-123
      await prisma.driverNotification.create({
        data: {
          id: 'notif-1',
          tripId: trip.id,
          driverId: 'driver-123',
          status: NotificationStatus.PENDING,
          notifiedAt: fiveSecondsAgo,
        },
      });

      // Create notification for another driver
      await prisma.driverNotification.create({
        data: {
          id: 'notif-2',
          tripId: trip.id,
          driverId: 'driver-789',
          status: NotificationStatus.PENDING,
          notifiedAt: fiveSecondsAgo,
        },
      });

      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].notificationId).toBe('notif-1');
    });

    it('should filter by status PENDING', async () => {
      const now = new Date();
      const fiveSecondsAgo = new Date(now.getTime() - 5000);

      const trip = await prisma.trip.create({
        data: {
          id: 'trip-123',
          passengerId: 'passenger-456',
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'Pickup Address',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Destination Address',
          estimatedFare: 2500,
          estimatedDistance: 1000,
          status: TripStatus.FINDING_DRIVER,
        },
      });

      await prisma.driverNotification.createMany({
        data: [
          {
            id: 'notif-1',
            tripId: trip.id,
            driverId: 'driver-123',
            status: NotificationStatus.PENDING,
            notifiedAt: fiveSecondsAgo,
          },
          {
            id: 'notif-2',
            tripId: trip.id,
            driverId: 'driver-123',
            status: NotificationStatus.ACCEPTED,
            notifiedAt: fiveSecondsAgo,
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/notifications')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].notificationId).toBe('notif-1');
    });
  });
});
