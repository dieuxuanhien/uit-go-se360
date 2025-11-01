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
    await prisma.user.deleteMany({});

    // Create test user for POST tests
    await prisma.user.create({
      data: {
        id: 'passenger-123',
        email: 'passenger@test.com',
        passwordHash: 'hash',
        role: 'PASSENGER',
        firstName: 'Test',
        lastName: 'Passenger',
        phoneNumber: '+1234567890',
      },
    });
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

  describe('GET /trips/:id', () => {
    let testPassenger, testDriver, testTrip, testTripWithDriver;

    beforeEach(async () => {
      // Create test users
      testPassenger = await prisma.user.create({
        data: {
          id: 'passenger-test-123',
          email: 'passenger-get@test.com',
          passwordHash: 'hash',
          role: 'PASSENGER',
          firstName: 'Test',
          lastName: 'Passenger',
          phoneNumber: '+1234567890',
        },
      });

      testDriver = await prisma.user.create({
        data: {
          id: 'driver-test-456',
          email: 'driver-get@test.com',
          passwordHash: 'hash',
          role: 'DRIVER',
          firstName: 'Test',
          lastName: 'Driver',
          phoneNumber: '+0987654321',
        },
      });

      // Create test trip
      testTrip = await prisma.trip.create({
        data: {
          passengerId: testPassenger.id,
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'District 1, Ho Chi Minh City',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Tan Binh District, Ho Chi Minh City',
          estimatedFare: 2500,
          estimatedDistance: 8.5,
          status: TripStatus.REQUESTED,
        },
      });

      // Create test trip with driver
      testTripWithDriver = await prisma.trip.create({
        data: {
          passengerId: testPassenger.id,
          driverId: testDriver.id,
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'District 1, Ho Chi Minh City',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Tan Binh District, Ho Chi Minh City',
          estimatedFare: 2500,
          estimatedDistance: 8.5,
          status: TripStatus.DRIVER_ASSIGNED,
        },
      });
    });

    it('should return 200 and trip details for passenger viewing own trip', async () => {
      const passengerToken = generateToken(testPassenger.id, 'PASSENGER');

      const response = await request(app.getHttpServer())
        .get(`/trips/${testTrip.id}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(response.body.id).toBe(testTrip.id);
      expect(response.body.passengerId).toBe(testPassenger.id);
      expect(response.body.status).toBe(TripStatus.REQUESTED);
      expect(response.body.passenger).toBeDefined();
      expect(response.body.passenger.id).toBe(testPassenger.id);
      expect(response.body.driver).toBeNull();
    });

    it('should return 200 and trip details for driver viewing assigned trip', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      const response = await request(app.getHttpServer())
        .get(`/trips/${testTripWithDriver.id}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body.id).toBe(testTripWithDriver.id);
      expect(response.body.driverId).toBe(testDriver.id);
      expect(response.body.status).toBe(TripStatus.DRIVER_ASSIGNED);
      expect(response.body.driver).toBeDefined();
      expect(response.body.driver.id).toBe(testDriver.id);
    });

    it("should return 403 for passenger viewing another passenger's trip", async () => {
      const otherPassengerToken = generateToken('other-passenger', 'PASSENGER');

      await request(app.getHttpServer())
        .get(`/trips/${testTrip.id}`)
        .set('Authorization', `Bearer ${otherPassengerToken}`)
        .expect(403);
    });

    it('should return 403 for driver viewing unassigned trip', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      await request(app.getHttpServer())
        .get(`/trips/${testTrip.id}`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(403);
    });

    it('should return 403 for driver viewing trip assigned to different driver', async () => {
      const otherDriverToken = generateToken('other-driver', 'DRIVER');

      await request(app.getHttpServer())
        .get(`/trips/${testTripWithDriver.id}`)
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .expect(403);
    });

    it('should return 404 for non-existent trip', async () => {
      const passengerToken = generateToken(testPassenger.id, 'PASSENGER');

      await request(app.getHttpServer())
        .get('/trips/non-existent-id')
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(404);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get(`/trips/${testTrip.id}`)
        .expect(401);
    });

    it('should include all required fields in response', async () => {
      const passengerToken = generateToken(testPassenger.id, 'PASSENGER');

      const response = await request(app.getHttpServer())
        .get(`/trips/${testTrip.id}`)
        .set('Authorization', `Bearer ${passengerToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('passengerId');
      expect(response.body).toHaveProperty('driverId');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('pickupLatitude');
      expect(response.body).toHaveProperty('pickupLongitude');
      expect(response.body).toHaveProperty('pickupAddress');
      expect(response.body).toHaveProperty('destinationLatitude');
      expect(response.body).toHaveProperty('destinationLongitude');
      expect(response.body).toHaveProperty('destinationAddress');
      expect(response.body).toHaveProperty('estimatedFare');
      expect(response.body).toHaveProperty('actualFare');
      expect(response.body).toHaveProperty('estimatedDistance');
      expect(response.body).toHaveProperty('requestedAt');
      expect(response.body).toHaveProperty('passenger');
      expect(response.body).toHaveProperty('driver');
    });
  });

  describe('POST /trips/:id/start-pickup', () => {
    let testPassenger, testDriver, testTripAssigned;

    beforeEach(async () => {
      // Create test users
      testPassenger = await prisma.user.create({
        data: {
          id: 'passenger-start-123',
          email: 'passenger-start@test.com',
          passwordHash: 'hash',
          role: 'PASSENGER',
          firstName: 'Test',
          lastName: 'Passenger',
          phoneNumber: '+1234567890',
        },
      });

      testDriver = await prisma.user.create({
        data: {
          id: 'driver-start-456',
          email: 'driver-start@test.com',
          passwordHash: 'hash',
          role: 'DRIVER',
          firstName: 'Test',
          lastName: 'Driver',
          phoneNumber: '+0987654321',
        },
      });

      // Create test trip with DRIVER_ASSIGNED status
      testTripAssigned = await prisma.trip.create({
        data: {
          passengerId: testPassenger.id,
          driverId: testDriver.id,
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'District 1, Ho Chi Minh City',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Tan Binh District, Ho Chi Minh City',
          estimatedFare: 2500,
          estimatedDistance: 8.5,
          status: TripStatus.DRIVER_ASSIGNED,
        },
      });
    });

    it('should return 200 and update trip status to EN_ROUTE_TO_PICKUP for assigned driver', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      const response = await request(app.getHttpServer())
        .post(`/trips/${testTripAssigned.id}/start-pickup`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body.status).toBe(TripStatus.EN_ROUTE_TO_PICKUP);
      expect(response.body.startedAt).toBeDefined();
      expect(new Date(response.body.startedAt).getTime()).toBeGreaterThan(0);
      expect(response.body.id).toBe(testTripAssigned.id);
      expect(response.body.driverId).toBe(testDriver.id);
    });

    it('should update database with EN_ROUTE_TO_PICKUP status and startedAt timestamp', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      await request(app.getHttpServer())
        .post(`/trips/${testTripAssigned.id}/start-pickup`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const updatedTrip = await prisma.trip.findUnique({
        where: { id: testTripAssigned.id },
      });

      expect(updatedTrip.status).toBe(TripStatus.EN_ROUTE_TO_PICKUP);
      expect(updatedTrip.startedAt).toBeDefined();
      expect(updatedTrip.startedAt.getTime()).toBeGreaterThan(0);
    });

    it('should return 403 for different driver attempting to start pickup', async () => {
      const otherDriverToken = generateToken('other-driver-789', 'DRIVER');

      await request(app.getHttpServer())
        .post(`/trips/${testTripAssigned.id}/start-pickup`)
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .expect(403);
    });

    it('should return 400 for trip in invalid status', async () => {
      // Create trip with REQUESTED status
      const invalidTrip = await prisma.trip.create({
        data: {
          passengerId: testPassenger.id,
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'District 1, Ho Chi Minh City',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Tan Binh District, Ho Chi Minh City',
          estimatedFare: 2500,
          estimatedDistance: 8.5,
          status: TripStatus.REQUESTED,
        },
      });

      const driverToken = generateToken(testDriver.id, 'DRIVER');

      await request(app.getHttpServer())
        .post(`/trips/${invalidTrip.id}/start-pickup`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(400);
    });

    it('should return 404 for non-existent trip', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      await request(app.getHttpServer())
        .post('/trips/non-existent-id/start-pickup')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post(`/trips/${testTripAssigned.id}/start-pickup`)
        .expect(401);
    });

    it('should return response with TripDto structure including passenger and driver', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      const response = await request(app.getHttpServer())
        .post(`/trips/${testTripAssigned.id}/start-pickup`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('passengerId');
      expect(response.body).toHaveProperty('driverId');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('pickupLatitude');
      expect(response.body).toHaveProperty('pickupLongitude');
      expect(response.body).toHaveProperty('pickupAddress');
      expect(response.body).toHaveProperty('destinationLatitude');
      expect(response.body).toHaveProperty('destinationLongitude');
      expect(response.body).toHaveProperty('destinationAddress');
      expect(response.body).toHaveProperty('estimatedFare');
      expect(response.body).toHaveProperty('actualFare');
      expect(response.body).toHaveProperty('estimatedDistance');
      expect(response.body).toHaveProperty('requestedAt');
      expect(response.body).toHaveProperty('driverAssignedAt');
      expect(response.body).toHaveProperty('startedAt');
      expect(response.body).toHaveProperty('completedAt');
      expect(response.body).toHaveProperty('cancelledAt');
      expect(response.body).toHaveProperty('cancellationReason');
      expect(response.body).toHaveProperty('passenger');
      expect(response.body).toHaveProperty('driver');
      expect(response.body.passenger).toBeDefined();
      expect(response.body.driver).toBeDefined();
    });
  });

  describe('POST /trips/:id/arrive-pickup', () => {
    let testPassenger, testDriver, testTripEnRoute;

    beforeEach(async () => {
      // Create test users
      testPassenger = await prisma.user.create({
        data: {
          id: 'passenger-arrive-123',
          email: 'passenger-arrive@test.com',
          passwordHash: 'hash',
          role: 'PASSENGER',
          firstName: 'Test',
          lastName: 'Passenger',
          phoneNumber: '+1234567890',
        },
      });

      testDriver = await prisma.user.create({
        data: {
          id: 'driver-arrive-456',
          email: 'driver-arrive@test.com',
          passwordHash: 'hash',
          role: 'DRIVER',
          firstName: 'Test',
          lastName: 'Driver',
          phoneNumber: '+0987654321',
        },
      });

      // Create test trip with EN_ROUTE_TO_PICKUP status
      testTripEnRoute = await prisma.trip.create({
        data: {
          passengerId: testPassenger.id,
          driverId: testDriver.id,
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'District 1, Ho Chi Minh City',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Tan Binh District, Ho Chi Minh City',
          estimatedFare: 2500,
          estimatedDistance: 8.5,
          status: TripStatus.EN_ROUTE_TO_PICKUP,
        },
      });
    });

    it('should return 200 and update trip status to ARRIVED_AT_PICKUP for assigned driver', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      const response = await request(app.getHttpServer())
        .post(`/trips/${testTripEnRoute.id}/arrive-pickup`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body.status).toBe(TripStatus.ARRIVED_AT_PICKUP);
      expect(response.body.arrivedAt).toBeDefined();
      expect(new Date(response.body.arrivedAt).getTime()).toBeGreaterThan(0);
      expect(response.body.id).toBe(testTripEnRoute.id);
      expect(response.body.driverId).toBe(testDriver.id);
    });

    it('should update database with ARRIVED_AT_PICKUP status and arrivedAt timestamp', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      await request(app.getHttpServer())
        .post(`/trips/${testTripEnRoute.id}/arrive-pickup`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const updatedTrip = await prisma.trip.findUnique({
        where: { id: testTripEnRoute.id },
      });

      expect(updatedTrip.status).toBe(TripStatus.ARRIVED_AT_PICKUP);
      expect(updatedTrip.arrivedAt).toBeDefined();
      expect(updatedTrip.arrivedAt.getTime()).toBeGreaterThan(0);
    });

    it('should return 403 for different driver attempting to mark arrival', async () => {
      const otherDriverToken = generateToken('other-driver-789', 'DRIVER');

      await request(app.getHttpServer())
        .post(`/trips/${testTripEnRoute.id}/arrive-pickup`)
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .expect(403);
    });

    it('should return 400 for trip in invalid status', async () => {
      // Create trip with DRIVER_ASSIGNED status
      const invalidTrip = await prisma.trip.create({
        data: {
          passengerId: testPassenger.id,
          driverId: testDriver.id,
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'District 1, Ho Chi Minh City',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Tan Binh District, Ho Chi Minh City',
          estimatedFare: 2500,
          estimatedDistance: 8.5,
          status: TripStatus.DRIVER_ASSIGNED,
        },
      });

      const driverToken = generateToken(testDriver.id, 'DRIVER');

      await request(app.getHttpServer())
        .post(`/trips/${invalidTrip.id}/arrive-pickup`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(400);
    });

    it('should return 404 for non-existent trip', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      await request(app.getHttpServer())
        .post('/trips/non-existent-id/arrive-pickup')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post(`/trips/${testTripEnRoute.id}/arrive-pickup`)
        .expect(401);
    });

    it('should return response with TripDto structure including passenger and driver', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      const response = await request(app.getHttpServer())
        .post(`/trips/${testTripEnRoute.id}/arrive-pickup`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('passengerId');
      expect(response.body).toHaveProperty('driverId');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('pickupLatitude');
      expect(response.body).toHaveProperty('pickupLongitude');
      expect(response.body).toHaveProperty('pickupAddress');
      expect(response.body).toHaveProperty('destinationLatitude');
      expect(response.body).toHaveProperty('destinationLongitude');
      expect(response.body).toHaveProperty('destinationAddress');
      expect(response.body).toHaveProperty('estimatedFare');
      expect(response.body).toHaveProperty('actualFare');
      expect(response.body).toHaveProperty('estimatedDistance');
      expect(response.body).toHaveProperty('requestedAt');
      expect(response.body).toHaveProperty('driverAssignedAt');
      expect(response.body).toHaveProperty('startedAt');
      expect(response.body).toHaveProperty('arrivedAt');
      expect(response.body).toHaveProperty('completedAt');
      expect(response.body).toHaveProperty('cancelledAt');
      expect(response.body).toHaveProperty('cancellationReason');
      expect(response.body).toHaveProperty('passenger');
      expect(response.body).toHaveProperty('driver');
    });
  });

  describe('POST /trips/:id/start-trip', () => {
    let testPassenger, testDriver, testTripArrived;

    beforeEach(async () => {
      // Create test users
      testPassenger = await prisma.user.create({
        data: {
          id: 'passenger-start-trip-123',
          email: 'passenger-start-trip@test.com',
          passwordHash: 'hash',
          role: 'PASSENGER',
          firstName: 'Test',
          lastName: 'Passenger',
          phoneNumber: '+1234567890',
        },
      });

      testDriver = await prisma.user.create({
        data: {
          id: 'driver-start-trip-456',
          email: 'driver-start-trip@test.com',
          passwordHash: 'hash',
          role: 'DRIVER',
          firstName: 'Test',
          lastName: 'Driver',
          phoneNumber: '+0987654321',
        },
      });

      // Create test trip with ARRIVED_AT_PICKUP status
      testTripArrived = await prisma.trip.create({
        data: {
          passengerId: testPassenger.id,
          driverId: testDriver.id,
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'District 1, Ho Chi Minh City',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Tan Binh District, Ho Chi Minh City',
          estimatedFare: 2500,
          estimatedDistance: 8.5,
          status: TripStatus.ARRIVED_AT_PICKUP,
        },
      });
    });

    it('should return 200 and update trip status to IN_PROGRESS for assigned driver', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      const response = await request(app.getHttpServer())
        .post(`/trips/${testTripArrived.id}/start-trip`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body.status).toBe(TripStatus.IN_PROGRESS);
      expect(response.body.pickedUpAt).toBeDefined();
      expect(new Date(response.body.pickedUpAt).getTime()).toBeGreaterThan(0);
      expect(response.body.id).toBe(testTripArrived.id);
      expect(response.body.driverId).toBe(testDriver.id);
    });

    it('should update database with IN_PROGRESS status and pickedUpAt timestamp', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      await request(app.getHttpServer())
        .post(`/trips/${testTripArrived.id}/start-trip`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      const updatedTrip = await prisma.trip.findUnique({
        where: { id: testTripArrived.id },
      });

      expect(updatedTrip.status).toBe(TripStatus.IN_PROGRESS);
      expect(updatedTrip.pickedUpAt).toBeDefined();
      expect(updatedTrip.pickedUpAt.getTime()).toBeGreaterThan(0);
    });

    it('should return 403 for different driver attempting to start trip', async () => {
      const otherDriverToken = generateToken('other-driver-789', 'DRIVER');

      await request(app.getHttpServer())
        .post(`/trips/${testTripArrived.id}/start-trip`)
        .set('Authorization', `Bearer ${otherDriverToken}`)
        .expect(403);
    });

    it('should return 400 for trip in invalid status', async () => {
      // Create trip with EN_ROUTE_TO_PICKUP status
      const invalidTrip = await prisma.trip.create({
        data: {
          passengerId: testPassenger.id,
          driverId: testDriver.id,
          pickupLatitude: 10.762622,
          pickupLongitude: 106.660172,
          pickupAddress: 'District 1, Ho Chi Minh City',
          destinationLatitude: 10.823099,
          destinationLongitude: 106.629662,
          destinationAddress: 'Tan Binh District, Ho Chi Minh City',
          estimatedFare: 2500,
          estimatedDistance: 8.5,
          status: TripStatus.EN_ROUTE_TO_PICKUP,
        },
      });

      const driverToken = generateToken(testDriver.id, 'DRIVER');

      await request(app.getHttpServer())
        .post(`/trips/${invalidTrip.id}/start-trip`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(400);
    });

    it('should return 404 for non-existent trip', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      await request(app.getHttpServer())
        .post('/trips/non-existent-id/start-trip')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);
    });

    it('should return 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .post(`/trips/${testTripArrived.id}/start-trip`)
        .expect(401);
    });

    it('should return response with TripDto structure including passenger and driver', async () => {
      const driverToken = generateToken(testDriver.id, 'DRIVER');

      const response = await request(app.getHttpServer())
        .post(`/trips/${testTripArrived.id}/start-trip`)
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('passengerId');
      expect(response.body).toHaveProperty('driverId');
      expect(response.body).toHaveProperty('status');
      expect(response.body).toHaveProperty('pickupLatitude');
      expect(response.body).toHaveProperty('pickupLongitude');
      expect(response.body).toHaveProperty('pickupAddress');
      expect(response.body).toHaveProperty('destinationLatitude');
      expect(response.body).toHaveProperty('destinationLongitude');
      expect(response.body).toHaveProperty('destinationAddress');
      expect(response.body).toHaveProperty('estimatedFare');
      expect(response.body).toHaveProperty('actualFare');
      expect(response.body).toHaveProperty('estimatedDistance');
      expect(response.body).toHaveProperty('requestedAt');
      expect(response.body).toHaveProperty('driverAssignedAt');
      expect(response.body).toHaveProperty('startedAt');
      expect(response.body).toHaveProperty('arrivedAt');
      expect(response.body).toHaveProperty('pickedUpAt');
      expect(response.body).toHaveProperty('completedAt');
      expect(response.body).toHaveProperty('cancelledAt');
      expect(response.body).toHaveProperty('cancellationReason');
      expect(response.body).toHaveProperty('passenger');
      expect(response.body).toHaveProperty('driver');
      expect(response.body.passenger).toBeDefined();
      expect(response.body.driver).toBeDefined();
    });
  });
});
