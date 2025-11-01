import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { TripStatus } from '@prisma/client';

describe('Trips (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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

  const passengerToken = generateToken('passenger-123', 'PASSENGER');
  const driverToken = generateToken('driver-456', 'DRIVER');

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  describe('POST /trips', () => {
    const validTripData = {
      pickupLatitude: 10.762622,
      pickupLongitude: 106.660172,
      pickupAddress: 'District 1, Ho Chi Minh City',
      destinationLatitude: 10.823099,
      destinationLongitude: 106.629662,
      destinationAddress: 'Tan Binh District, Ho Chi Minh City',
    };

    it('should return 201 with trip object for valid data', async () => {
      const response = await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(validTripData)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.passengerId).toBe('passenger-123');
      expect(response.body.status).toBe(TripStatus.REQUESTED);
      expect(response.body.pickupLatitude).toBe(10.762622);
      expect(response.body.destinationLatitude).toBe(10.823099);
    });

    it('should include estimatedFare > 0 in response', async () => {
      const response = await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(validTripData)
        .expect(201);

      expect(response.body.estimatedFare).toBeGreaterThan(0);
      expect(typeof response.body.estimatedFare).toBe('number');
    });

    it('should persist trip in database with status = REQUESTED', async () => {
      const response = await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(validTripData)
        .expect(201);

      const tripId = response.body.id;
      const tripInDb = await prisma.trip.findUnique({ where: { id: tripId } });

      expect(tripInDb).toBeDefined();
      expect(tripInDb.status).toBe(TripStatus.REQUESTED);
      expect(tripInDb.passengerId).toBe('passenger-123');
    });

    it('should include all coordinate fields in persisted trip', async () => {
      const response = await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(validTripData)
        .expect(201);

      const tripId = response.body.id;
      const tripInDb = await prisma.trip.findUnique({ where: { id: tripId } });

      expect(Number(tripInDb.pickupLatitude)).toBe(10.762622);
      expect(Number(tripInDb.pickupLongitude)).toBe(106.660172);
      expect(Number(tripInDb.destinationLatitude)).toBe(10.823099);
      expect(Number(tripInDb.destinationLongitude)).toBe(106.629662);
    });

    it('should calculate and include estimatedDistance', async () => {
      const response = await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(validTripData)
        .expect(201);

      expect(response.body.estimatedDistance).toBeGreaterThan(0);
      expect(typeof response.body.estimatedDistance).toBe('number');
    });

    it('should return 400 for latitude > 90', async () => {
      const invalidData = {
        ...validTripData,
        pickupLatitude: 95.5,
      };

      const response = await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.message).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Latitude must be between -90 and 90'),
        ]),
      );
    });

    it('should return 400 for latitude < -90', async () => {
      const invalidData = {
        ...validTripData,
        destinationLatitude: -95.5,
      };

      await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 400 for longitude > 180', async () => {
      const invalidData = {
        ...validTripData,
        pickupLongitude: 200.0,
      };

      await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 400 for longitude < -180', async () => {
      const invalidData = {
        ...validTripData,
        destinationLongitude: -200.0,
      };

      await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 400 for missing required fields', async () => {
      const invalidData = {
        pickupLatitude: 10.762622,
        pickupLongitude: 106.660172,
        // Missing other required fields
      };

      await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(invalidData)
        .expect(400);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post('/trips')
        .send(validTripData)
        .expect(401);
    });

    it('should return 403 for driver role attempting to create trip', async () => {
      await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(validTripData)
        .expect(403);
    });

    it('should handle same location trip (distance = 0)', async () => {
      const sameLocationData = {
        pickupLatitude: 10.762622,
        pickupLongitude: 106.660172,
        pickupAddress: 'Test Location',
        destinationLatitude: 10.762622,
        destinationLongitude: 106.660172,
        destinationAddress: 'Test Location',
      };

      const response = await request(app.getHttpServer())
        .post('/trips')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(sameLocationData)
        .expect(201);

      expect(response.body.estimatedDistance).toBe(0);
      // Should still have minimum fare
      expect(response.body.estimatedFare).toBeGreaterThan(0);
    });
  });
});
