import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { DatabaseService } from '../../src/database/database.service';
import { HttpExceptionFilter } from '../../src/common/filters/http-exception.filter';

describe('Driver Profiles (e2e)', () => {
  let app: INestApplication;
  let prisma: DatabaseService;
  let driverToken: string;
  let passengerToken: string;
  let driverId: string;
  let _passengerId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    prisma = app.get<DatabaseService>(DatabaseService);

    // Clean database
    await prisma.driverProfile.deleteMany();
    await prisma.user.deleteMany();

    // Create test driver user
    const driverResponse = await request(app.getHttpServer())
      .post('/users/register')
      .send({
        email: 'driver@test.com',
        password: 'Password123!',
        role: 'DRIVER',
        firstName: 'John',
        lastName: 'Doe',
        phoneNumber: '+1234567890',
      });

    console.log(
      'Driver registration response:',
      driverResponse.status,
      driverResponse.body,
    );

    if (!driverResponse.body.user || !driverResponse.body.accessToken) {
      throw new Error('Failed to create driver user for tests');
    }

    driverId = driverResponse.body.user.id;
    driverToken = driverResponse.body.accessToken;

    // Create test passenger user
    const passengerResponse = await request(app.getHttpServer())
      .post('/users/register')
      .send({
        email: 'passenger@test.com',
        password: 'Password123!',
        role: 'PASSENGER',
        firstName: 'Jane',
        lastName: 'Smith',
        phoneNumber: '+9876543210',
      });

    console.log(
      'Passenger registration response:',
      passengerResponse.status,
      passengerResponse.body,
    );

    if (!passengerResponse.body.user || !passengerResponse.body.accessToken) {
      throw new Error('Failed to create passenger user for tests');
    }

    _passengerId = passengerResponse.body.user.id;
    passengerToken = passengerResponse.body.accessToken;
  });

  afterAll(async () => {
    await prisma.driverProfile.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Clean driver profiles before each test
    await prisma.driverProfile.deleteMany();
  });

  describe('POST /users/driver-profile', () => {
    const validProfileData = {
      vehicleMake: 'Toyota',
      vehicleModel: 'Camry',
      vehicleYear: 2022,
      vehiclePlate: '51A-12345',
      vehicleColor: 'Silver',
      licenseNumber: 'DL123456789',
    };

    it('should create driver profile with valid DRIVER token (201 Created)', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(validProfileData);

      console.log('Create profile response:', response.status, response.body);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.userId).toBe(driverId);
      expect(response.body.vehicleMake).toBe('Toyota');
      expect(response.body.approvalStatus).toBe('PENDING');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe('driver@test.com');
    });

    it('should reject PASSENGER user creating profile (403 Forbidden)', () => {
      return request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${passengerToken}`)
        .send(validProfileData)
        .expect(403);
    });

    it('should reject request without authentication (401 Unauthorized)', () => {
      return request(app.getHttpServer())
        .post('/users/driver-profile')
        .send(validProfileData)
        .expect(401);
    });

    it('should reject duplicate profile for same user (409 Conflict)', async () => {
      // Create first profile
      await request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(validProfileData)
        .expect(201);

      // Try to create second profile
      return request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          ...validProfileData,
          vehiclePlate: '51A-99999',
          licenseNumber: 'DL999999999',
        })
        .expect(409);
    });

    it('should reject duplicate vehicle plate (409 Conflict)', async () => {
      // Create first profile with a different driver
      const driver2Response = await request(app.getHttpServer())
        .post('/users/register')
        .send({
          email: 'driver2@test.com',
          password: 'Password123!',
          role: 'DRIVER',
          firstName: 'Bob',
          lastName: 'Wilson',
          phoneNumber: '+1111111111',
        });

      const driver2Token = driver2Response.body.accessToken;

      await request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(validProfileData)
        .expect(201);

      // Try to create profile with same plate
      return request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driver2Token}`)
        .send({
          ...validProfileData,
          licenseNumber: 'DL987654321',
        })
        .expect(409);
    });

    it('should reject duplicate license number (409 Conflict)', async () => {
      // Create first profile
      await request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(validProfileData)
        .expect(201);

      // Create another driver
      const driver3Response = await request(app.getHttpServer())
        .post('/users/register')
        .send({
          email: 'driver3@test.com',
          password: 'Password123!',
          role: 'DRIVER',
          firstName: 'Alice',
          lastName: 'Brown',
          phoneNumber: '+2222222222',
        });

      const driver3Token = driver3Response.body.accessToken;

      // Try to create profile with same license number
      return request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driver3Token}`)
        .send({
          ...validProfileData,
          vehiclePlate: '52B-11111',
        })
        .expect(409);
    });

    it('should reject invalid vehicle year < 2000 (400 Bad Request)', () => {
      return request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          ...validProfileData,
          vehicleYear: 1999,
        })
        .expect(400);
    });

    it('should reject invalid vehicle year > 2026 (400 Bad Request)', () => {
      return request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          ...validProfileData,
          vehicleYear: 2027,
        })
        .expect(400);
    });

    it('should reject missing required fields (400 Bad Request)', () => {
      return request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .send({
          vehicleMake: 'Toyota',
          // Missing other fields
        })
        .expect(400);
    });
  });

  describe('GET /users/driver-profile', () => {
    const validProfileData = {
      vehicleMake: 'Honda',
      vehicleModel: 'Civic',
      vehicleYear: 2023,
      vehiclePlate: '53C-67890',
      vehicleColor: 'Black',
      licenseNumber: 'DL555555555',
    };

    it('should return driver profile (200 OK)', async () => {
      // Create profile first
      await request(app.getHttpServer())
        .post('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .send(validProfileData)
        .expect(201);

      // Get profile
      return request(app.getHttpServer())
        .get('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.userId).toBe(driverId);
          expect(res.body.vehicleMake).toBe('Honda');
          expect(res.body.vehicleModel).toBe('Civic');
          expect(res.body.approvalStatus).toBe('PENDING');
          expect(res.body).toHaveProperty('user');
        });
    });

    it('should return 404 for driver without profile', () => {
      return request(app.getHttpServer())
        .get('/users/driver-profile')
        .set('Authorization', `Bearer ${driverToken}`)
        .expect(404);
    });

    it('should reject request without authentication (401 Unauthorized)', () => {
      return request(app.getHttpServer())
        .get('/users/driver-profile')
        .expect(401);
    });
  });
});
