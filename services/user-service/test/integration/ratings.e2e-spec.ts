import { Test, TestingModule } from '@nestjs/testing';
import {
  INestApplication,
  ValidationPipe,
  NotFoundException,
} from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DatabaseService } from '../../src/database/database.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';
import { TripServiceClient } from '../../src/integrations/trip-service.client';
import { TripStatus } from '@uit-go/shared-types';

describe('Ratings (e2e)', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;
  let tripServiceClient: jest.Mocked<TripServiceClient>;

  const mockTrip = {
    id: 'trip-123',
    passengerId: 'passenger-123',
    driverId: 'driver-456',
    status: TripStatus.COMPLETED,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(TripServiceClient)
      .useValue({
        getTripById: jest.fn(),
      })
      .compile();

    app = moduleFixture.createNestApplication();

    // Apply same pipes and filters as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: {
          enableImplicitConversion: true,
        },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());

    await app.init();

    databaseService = moduleFixture.get<DatabaseService>(DatabaseService);
    tripServiceClient = moduleFixture.get(TripServiceClient);
  });

  afterAll(async () => {
    await databaseService.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Clean database before each test
    await databaseService.rating.deleteMany();
    await databaseService.user.deleteMany();

    // Create driver user for the trip
    await request(app.getHttpServer()).post('/users/register').send({
      email: 'driver@example.com',
      password: 'password123',
      role: 'DRIVER',
      firstName: 'Jane',
      lastName: 'Smith',
      phoneNumber: '+0987654321',
    });

    const driver = await databaseService.user.findFirst({
      where: { email: 'driver@example.com' },
    });
    mockTrip.driverId = driver!.id;

    tripServiceClient.getTripById.mockResolvedValue(mockTrip);
  });

  describe('POST /trips/:tripId/rating', () => {
    let passengerToken: string;
    let passengerId: string;

    beforeEach(async () => {
      // Create passenger user
      await request(app.getHttpServer()).post('/users/register').send({
        email: 'passenger@example.com',
        password: 'password123',
        role: 'PASSENGER',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
      });

      // Login to get token
      const loginResponse = await request(app.getHttpServer())
        .post('/users/login')
        .send({
          email: 'passenger@example.com',
          password: 'password123',
        });

      passengerToken = loginResponse.body.accessToken;
      passengerId = loginResponse.body.user.id;

      // Update mock trip with correct passengerId
      mockTrip.passengerId = passengerId;
      passengerId = loginResponse.body.user.id;

      // Update mock trip with correct passengerId
      mockTrip.passengerId = passengerId;
    });

    it('should return 201 and create rating with 5 stars and comment', async () => {
      const response = await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          stars: 5,
          comment: 'Excellent driver!',
        });

      expect(response.status).toBe(201);
      expect(response.body).toMatchObject({
        id: expect.any(String),
        tripId: 'trip-123',
        passengerId: expect.any(String),
        driverId: expect.any(String),
        stars: 5,
        comment: 'Excellent driver!',
        createdAt: expect.any(String),
      });

      // Verify in database
      const rating = await databaseService.rating.findFirst({
        where: { tripId: 'trip-123' },
      });
      expect(rating).toMatchObject({
        tripId: 'trip-123',
        passengerId: expect.any(String),
        driverId: expect.any(String),
        stars: 5,
        comment: 'Excellent driver!',
      });
    });

    it('should return 201 and create rating with 1 star without comment', async () => {
      const response = await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          stars: 1,
        });

      expect(response.status).toBe(201);
      expect(response.body.stars).toBe(1);
      expect(response.body.comment).toBeNull();
    });

    it('should return 409 on duplicate rating', async () => {
      // First rating
      await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ stars: 5 });

      // Second rating
      const response = await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ stars: 4 });

      expect(response.status).toBe(409);
    });

    it('should return 403 for driver user', async () => {
      // Create driver user
      await request(app.getHttpServer()).post('/users/register').send({
        email: 'driver@example.com',
        password: 'password123',
        role: 'DRIVER',
        firstName: 'Jane',
        lastName: 'Smith',
        phoneNumber: '+0987654321',
      });

      const loginResponse = await request(app.getHttpServer())
        .post('/users/login')
        .send({
          email: 'driver@example.com',
          password: 'password123',
        });

      const driverToken = loginResponse.body.accessToken;

      const response = await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({ stars: 5 });

      expect(response.status).toBe(403);
    });

    it('should return 400 for trip not completed', async () => {
      tripServiceClient.getTripById.mockResolvedValue({
        ...mockTrip,
        status: TripStatus.IN_PROGRESS,
      });

      const response = await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ stars: 5 });

      expect(response.status).toBe(400);
    });

    it('should return 404 for non-existent trip', async () => {
      tripServiceClient.getTripById.mockRejectedValue(
        new NotFoundException('Trip not found'),
      );

      const response = await request(app.getHttpServer())
        .post('/trips/trip-999/rating')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ stars: 5 });

      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .send({ stars: 5 });

      expect(response.status).toBe(401);
    });

    it('should return 400 for invalid stars (0)', async () => {
      const response = await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ stars: 0 });

      expect(response.status).toBe(400);
    });

    it('should return 400 for invalid stars (6)', async () => {
      const response = await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ stars: 6 });

      expect(response.status).toBe(400);
    });

    it('should return 400 for comment too long', async () => {
      const longComment = 'a'.repeat(501);
      const response = await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({ stars: 5, comment: longComment });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /trips/:tripId/rating', () => {
    let passengerToken: string;
    let driverToken: string;
    let passengerId: string;
    let driverId: string;
    let otherPassengerToken: string;

    beforeEach(async () => {
      // Create passenger user
      await request(app.getHttpServer()).post('/users/register').send({
        email: 'passenger@example.com',
        password: 'password123',
        role: 'PASSENGER',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
      });

      const passengerLogin = await request(app.getHttpServer())
        .post('/users/login')
        .send({
          email: 'passenger@example.com',
          password: 'password123',
        });

      passengerToken = passengerLogin.body.accessToken;
      passengerId = passengerLogin.body.user.id;

      // Create driver user
      await request(app.getHttpServer()).post('/users/register').send({
        email: 'driver@example.com',
        password: 'password123',
        role: 'DRIVER',
        firstName: 'Jane',
        lastName: 'Smith',
        phoneNumber: '+0987654321',
      });

      const driverLogin = await request(app.getHttpServer())
        .post('/users/login')
        .send({
          email: 'driver@example.com',
          password: 'password123',
        });

      driverToken = driverLogin.body.accessToken;
      driverId = driverLogin.body.user.id;

      // Create another passenger
      await request(app.getHttpServer()).post('/users/register').send({
        email: 'other@example.com',
        password: 'password123',
        role: 'PASSENGER',
        firstName: 'Bob',
        lastName: 'Wilson',
        phoneNumber: '+1111111111',
      });

      const otherLogin = await request(app.getHttpServer())
        .post('/users/login')
        .send({
          email: 'other@example.com',
          password: 'password123',
        });

      otherPassengerToken = otherLogin.body.accessToken;

      // Update mock trip with correct IDs
      mockTrip.passengerId = passengerId;
      mockTrip.driverId = driverId;

      // Create a rating for the trip
      await request(app.getHttpServer())
        .post('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send({
          stars: 5,
          comment: 'Excellent driver!',
        });
    });

    it('should return 200 and full rating for passenger viewing their own rating', async () => {
      const response = await request(app.getHttpServer())
        .get('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: expect.any(String),
        tripId: 'trip-123',
        passengerId: expect.any(String),
        driverId: expect.any(String),
        stars: 5,
        comment: 'Excellent driver!',
        createdAt: expect.any(String),
      });
    });

    it('should return 200 and rating without passengerId for driver viewing their trip rating', async () => {
      const response = await request(app.getHttpServer())
        .get('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${driverToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        id: expect.any(String),
        tripId: 'trip-123',
        driverId: expect.any(String),
        stars: 5,
        comment: 'Excellent driver!',
        createdAt: expect.any(String),
      });
      expect(response.body.passengerId).toBeUndefined();
    });

    it('should return 403 for different passenger viewing rating', async () => {
      const response = await request(app.getHttpServer())
        .get('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${otherPassengerToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 403 for different driver viewing rating', async () => {
      // Create another driver
      await request(app.getHttpServer()).post('/users/register').send({
        email: 'otherdriver@example.com',
        password: 'password123',
        role: 'DRIVER',
        firstName: 'Alice',
        lastName: 'Brown',
        phoneNumber: '+2222222222',
      });

      const otherDriverLogin = await request(app.getHttpServer())
        .post('/users/login')
        .send({
          email: 'otherdriver@example.com',
          password: 'password123',
        });

      const otherDriverToken = otherDriverLogin.body.accessToken;

      const response = await request(app.getHttpServer())
        .get('/trips/trip-123/rating')
        .set('Authorization', `Bearer ${otherDriverToken}`);

      expect(response.status).toBe(403);
    });

    it('should return 404 for trip without rating', async () => {
      const response = await request(app.getHttpServer())
        .get('/trips/trip-999/rating')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 404 for non-existent trip', async () => {
      tripServiceClient.getTripById.mockRejectedValue(
        new NotFoundException('Trip not found'),
      );

      const response = await request(app.getHttpServer())
        .get('/trips/trip-999/rating')
        .set('Authorization', `Bearer ${passengerToken}`);

      expect(response.status).toBe(404);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app.getHttpServer()).get(
        '/trips/trip-123/rating',
      );

      expect(response.status).toBe(401);
    });
  });
});
