import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import supertest from 'supertest';
import { AppModule } from '../../src/app.module';
import { RedisService } from '../../src/redis/redis.service';

describe('Driver Status (e2e)', () => {
  let app: INestApplication;
  let redisService: RedisService;
  let request: ReturnType<typeof supertest>;

  // JWT tokens (generated from user-service with same JWT_SECRET)
  const driverToken =
    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDAiLCJlbWFpbCI6ImRyaXZlckBleGFtcGxlLmNvbSIsInJvbGUiOiJEUklWRVIiLCJpYXQiOjE3NjE1MDM5ODQsImV4cCI6MTc2NDA5NTk4NH0.EemeepJu1SCpP5L1ZPYV79BWiux4Mji6SvPbm_u3D5A';
  const passengerToken =
    'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2NjBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDEiLCJlbWFpbCI6InBhc3NlbmdlckBleGFtcGxlLmNvbSIsInJvbGUiOiJQQVNTRU5HRVIiLCJpYXQiOjE3NjE1MDM5ODQsImV4cCI6MTc2NDA5NTk4NH0.on66xQszMSdMHMaucS3khVR6JLUOHN57UV5VW61EQ54';
  const driverId = '550e8400-e29b-41d4-a716-446655440000';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Apply the same validation pipe as main.ts
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    request = supertest(app.getHttpServer());
    redisService = moduleFixture.get<RedisService>(RedisService);
  });

  afterAll(async () => {
    if (redisService) {
      await redisService.quit();
    }
    if (app) {
      await app.close();
    }
  });

  beforeEach(async () => {
    // Clean Redis before each test
    await redisService.flushdb();
  });

  describe('PUT /drivers/status', () => {
    it('should set driver status to online with valid DRIVER token', () => {
      return request
        .put('/drivers/status')
        .set('Authorization', driverToken)
        .send({ isOnline: true })
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toHaveProperty('driverId');
          expect(res.body.isOnline).toBe(true);
          expect(res.body).toHaveProperty('timestamp');
          expect(new Date(res.body.timestamp).getTime()).toBeLessThanOrEqual(Date.now());
        });
    });

    it('should set driver status to offline', () => {
      return request
        .put('/drivers/status')
        .set('Authorization', driverToken)
        .send({ isOnline: false })
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toHaveProperty('driverId');
          expect(res.body.isOnline).toBe(false);
          expect(res.body).toHaveProperty('timestamp');
        });
    });

    it('should reject PASSENGER user updating status (403 Forbidden)', () => {
      return request
        .put('/drivers/status')
        .set('Authorization', passengerToken)
        .send({ isOnline: true })
        .expect(403);
    });

    it('should reject request without authentication (401 Unauthorized)', () => {
      return request.put('/drivers/status').send({ isOnline: true }).expect(401);
    });

    it('should reject invalid isOnline value (400 Bad Request)', () => {
      return request
        .put('/drivers/status')
        .set('Authorization', driverToken)
        .send({ isOnline: 'invalid' })
        .expect(400);
    });

    it('should reject missing isOnline field (400 Bad Request)', () => {
      return request.put('/drivers/status').set('Authorization', driverToken).send({}).expect(400);
    });
  });

  describe('GET /drivers/status', () => {
    it('should return current driver status (200 OK)', async () => {
      // First set status to online
      await request
        .put('/drivers/status')
        .set('Authorization', driverToken)
        .send({ isOnline: true })
        .expect(200);

      // Then get the status
      return request
        .get('/drivers/status')
        .set('Authorization', driverToken)
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toHaveProperty('driverId');
          expect(res.body.isOnline).toBe(true);
          expect(res.body).toHaveProperty('timestamp');
        });
    });

    it('should return 404 for driver without status', () => {
      return request.get('/drivers/status').set('Authorization', driverToken).expect(404);
    });

    it('should reject PASSENGER user getting driver status (403 Forbidden)', () => {
      return request.get('/drivers/status').set('Authorization', passengerToken).expect(403);
    });

    it('should reject request without authentication (401 Unauthorized)', () => {
      return request.get('/drivers/status').expect(401);
    });
  });

  describe('GET /health', () => {
    it('should return healthy status with Redis connected', () => {
      return request
        .get('/health')
        .expect(200)
        .expect((res: any) => {
          expect(res.body.status).toBe('healthy');
          expect(res.body.service).toBe('driver-service');
          expect(res.body.redis).toBe('connected');
          expect(res.body).toHaveProperty('timestamp');
          expect(res.body).toHaveProperty('version');
        });
    });
  });

  describe('PUT /drivers/location', () => {
    const validLocation = {
      latitude: 10.762622,
      longitude: 106.660172,
      heading: 45,
      speed: 30,
      accuracy: 10,
    };

    beforeEach(async () => {
      // Set driver status to online before each location test
      await redisService.set(
        `driver:status:${driverId}`,
        JSON.stringify({
          driverId,
          isOnline: true,
          timestamp: new Date().toISOString(),
        }),
      );
    });

    it('should update driver location successfully', () => {
      return request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send(validLocation)
        .expect(200)
        .expect((res: any) => {
          expect(res.body).toHaveProperty('driverId');
          expect(res.body.latitude).toBe(10.762622);
          expect(res.body.longitude).toBe(106.660172);
          expect(res.body.heading).toBe(45);
          expect(res.body.speed).toBe(30);
          expect(res.body.accuracy).toBe(10);
          expect(res.body.isOnline).toBe(true);
          expect(res.body).toHaveProperty('timestamp');
        });
    });

    it('should store location in Redis geospatial index', async () => {
      await request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send({ latitude: 10.762622, longitude: 106.660172 })
        .expect(200);

      // Verify geospatial index
      const position = await redisService.geopos('driver:geo', driverId);
      expect(position).toBeDefined();
      expect(position.length).toBeGreaterThan(0);
      if (position[0]) {
        expect(parseFloat(position[0][0])).toBeCloseTo(106.660172, 5);
        expect(parseFloat(position[0][1])).toBeCloseTo(10.762622, 5);
      }
    });

    it('should store location metadata in Redis', async () => {
      await request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send(validLocation)
        .expect(200);

      // Verify metadata
      const locationJson = await redisService.get(`driver:location:${driverId}`);
      expect(locationJson).toBeDefined();
      const location = JSON.parse(locationJson!);
      expect(location.driverId).toBe(driverId);
      expect(location.latitude).toBe(10.762622);
      expect(location.longitude).toBe(106.660172);
      expect(location.isOnline).toBe(true);
      expect(location.heading).toBe(45);
    });

    it('should reject offline driver location update', async () => {
      // Set driver status to offline
      await redisService.set(
        `driver:status:${driverId}`,
        JSON.stringify({
          driverId,
          isOnline: false,
          timestamp: new Date().toISOString(),
        }),
      );

      return request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send(validLocation)
        .expect(403);
    });

    it('should reject location update for driver without status', async () => {
      // Clear driver status
      await redisService.del(`driver:status:${driverId}`);

      return request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send(validLocation)
        .expect(403);
    });

    it('should reject PASSENGER token', async () => {
      return request
        .put('/drivers/location')
        .set('Authorization', passengerToken)
        .send(validLocation)
        .expect(403);
    });

    it('should reject request without authentication', () => {
      return request.put('/drivers/location').send(validLocation).expect(401);
    });

    it('should reject invalid latitude (91)', () => {
      return request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send({ ...validLocation, latitude: 91 })
        .expect(400);
    });

    it('should reject invalid latitude (-91)', () => {
      return request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send({ ...validLocation, latitude: -91 })
        .expect(400);
    });

    it('should reject invalid longitude (181)', () => {
      return request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send({ ...validLocation, longitude: 181 })
        .expect(400);
    });

    it('should reject invalid longitude (-181)', () => {
      return request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send({ ...validLocation, longitude: -181 })
        .expect(400);
    });

    it('should accept location update without optional fields', () => {
      return request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send({ latitude: 10.762622, longitude: 106.660172 })
        .expect(200)
        .expect((res: any) => {
          expect(res.body.latitude).toBe(10.762622);
          expect(res.body.longitude).toBe(106.660172);
          expect(res.body).not.toHaveProperty('heading');
          expect(res.body).not.toHaveProperty('speed');
          expect(res.body).not.toHaveProperty('accuracy');
        });
    });

    it('should reject missing latitude field', () => {
      return request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send({ longitude: 106.660172 })
        .expect(400);
    });

    it('should reject missing longitude field', () => {
      return request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send({ latitude: 10.762622 })
        .expect(400);
    });

    it('should verify location TTL is set to 300 seconds', async () => {
      await request
        .put('/drivers/location')
        .set('Authorization', driverToken)
        .send(validLocation)
        .expect(200);

      // Check TTL
      const ttl = await redisService.ttl(`driver:location:${driverId}`);
      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(300);
    });
  });

  describe('GET /drivers/search', () => {
    // Test driver IDs and tokens
    const driver1Id = '550e8400-e29b-41d4-a716-446655440001';
    const driver2Id = '550e8400-e29b-41d4-a716-446655440002';
    const driver3Id = '550e8400-e29b-41d4-a716-446655440003';

    // // JWT tokens for test drivers
    // const driver1Token =
    //   'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDEiLCJlbWFpbCI6ImRyaXZlcjFAZXhhbXBsZS5jb20iLCJyb2xlIjoiRFJJVkVSIiwiaWF0IjoxNzYxNTAzOTg0LCJleHAiOjE3NjQwOTU5ODR9.JLdYWpnZJTLz1FqVrmT3TjWq9WcPZ0qPn8aGjzWb-P4';
    // const driver2Token =
    //   'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDIiLCJlbWFpbCI6ImRyaXZlcjJAZXhhbXBsZS5jb20iLCJyb2xlIjoiRFJJVkVSIiwiaWF0IjoxNzYxNTAzOTg0LCJleHAiOjE3NjQwOTU5ODR9.mO2qR3G1XWlM5FqQm_Qi6mU-7Xk0gPh9bZcNjR4vE8Y';
    // const driver3Token =
    //   'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI1NTBlODQwMC1lMjliLTQxZDQtYTcxNi00NDY2NTU0NDAwMDMiLCJlbWFpbCI6ImRyaXZlcjNAZXhhbXBsZS5jb20iLCJyb2xlIjoiRFJJVkVSIiwiaWF0IjoxNzYxNTAzOTg0LCJleHAiOjE3NjQwOTU5ODR9.k8PzY3N0RvLp4Jj_Wb5Hn7dX-2Mz9qFl1sUwV6gT0cI';

    // Test location near HCMC University of Information Technology
    const searchCenter = {
      latitude: 10.762622,
      longitude: 106.660172,
    };

    // Nearby locations
    const location1 = {
      latitude: 10.762822, // ~22m from center
      longitude: 106.660372,
    };
    const location2 = {
      latitude: 10.765122, // ~278m from center
      longitude: 106.662172,
    };
    const location3 = {
      latitude: 10.77, // ~900m from center
      longitude: 106.668,
    };

    beforeEach(async () => {
      // Clean Redis before each test
      await redisService.flushdb();

      // Setup driver1: online with location
      await redisService.set(
        `driver:status:${driver1Id}`,
        JSON.stringify({
          driverId: driver1Id,
          isOnline: true,
          timestamp: new Date().toISOString(),
        }),
      );
      await redisService.geoadd('driver:geo', location1.longitude, location1.latitude, driver1Id);
      await redisService.set(
        `driver:location:${driver1Id}`,
        JSON.stringify({
          driverId: driver1Id,
          latitude: location1.latitude,
          longitude: location1.longitude,
          isOnline: true,
          timestamp: new Date().toISOString(),
        }),
        'EX',
        300,
      );

      // Setup driver2: online with location
      await redisService.set(
        `driver:status:${driver2Id}`,
        JSON.stringify({
          driverId: driver2Id,
          isOnline: true,
          timestamp: new Date().toISOString(),
        }),
      );
      await redisService.geoadd('driver:geo', location2.longitude, location2.latitude, driver2Id);
      await redisService.set(
        `driver:location:${driver2Id}`,
        JSON.stringify({
          driverId: driver2Id,
          latitude: location2.latitude,
          longitude: location2.longitude,
          isOnline: true,
          timestamp: new Date().toISOString(),
        }),
        'EX',
        300,
      );

      // Setup driver3: offline with location
      await redisService.set(
        `driver:status:${driver3Id}`,
        JSON.stringify({
          driverId: driver3Id,
          isOnline: false,
          timestamp: new Date().toISOString(),
        }),
      );
      await redisService.geoadd('driver:geo', location3.longitude, location3.latitude, driver3Id);
      await redisService.set(
        `driver:location:${driver3Id}`,
        JSON.stringify({
          driverId: driver3Id,
          latitude: location3.latitude,
          longitude: location3.longitude,
          isOnline: false,
          timestamp: new Date().toISOString(),
        }),
        'EX',
        300,
      );
    });

    it('should search nearby drivers with default parameters (authenticated)', async () => {
      const startTime = Date.now();

      const response = await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude })
        .expect(200);

      const executionTime = Date.now() - startTime;

      expect(response.body).toHaveProperty('drivers');
      expect(response.body).toHaveProperty('searchRadius', 5);
      expect(response.body).toHaveProperty('totalFound');

      // Should only return online drivers (driver1 and driver2, not driver3)
      expect(response.body.drivers.length).toBe(2);
      expect(response.body.totalFound).toBe(2);

      // Verify drivers are sorted by distance (closest first)
      expect(response.body.drivers[0].driverId).toBe(driver1Id);
      expect(response.body.drivers[1].driverId).toBe(driver2Id);

      // Verify driver1 details
      expect(response.body.drivers[0]).toHaveProperty('latitude', location1.latitude);
      expect(response.body.drivers[0]).toHaveProperty('longitude', location1.longitude);
      expect(response.body.drivers[0]).toHaveProperty('distance');
      expect(response.body.drivers[0].distance).toBeGreaterThan(0); // in meters
      expect(response.body.drivers[0].distance).toBeLessThan(100); // ~22m
      expect(response.body.drivers[0]).toHaveProperty('isOnline', true);

      // Verify driver2 details
      expect(response.body.drivers[1]).toHaveProperty('latitude', location2.latitude);
      expect(response.body.drivers[1]).toHaveProperty('longitude', location2.longitude);
      expect(response.body.drivers[1]).toHaveProperty('distance');
      expect(response.body.drivers[1].distance).toBeGreaterThan(200); // ~278m
      expect(response.body.drivers[1].distance).toBeLessThan(400);
      expect(response.body.drivers[1]).toHaveProperty('isOnline', true);

      // Verify query executes quickly (under 500ms)
      expect(executionTime).toBeLessThan(500);
    });

    it('should search with custom radius parameter', async () => {
      const response = await request
        .get('/drivers/search')
        .set('Authorization', passengerToken) // Passenger can also search
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude, radius: 10 })
        .expect(200);

      expect(response.body.searchRadius).toBe(10);
      expect(response.body.drivers.length).toBe(2); // Still 2 online drivers
    });

    it('should search with custom limit parameter', async () => {
      const response = await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude, limit: 1 })
        .expect(200);

      expect(response.body.drivers.length).toBe(1);
      expect(response.body.totalFound).toBe(1);
      expect(response.body.drivers[0].driverId).toBe(driver1Id); // Closest driver
    });

    it('should return empty array when no nearby drivers exist', async () => {
      // Search in a location far from all drivers
      const response = await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: 20.0, longitude: 120.0, radius: 5 })
        .expect(200);

      expect(response.body.drivers).toEqual([]);
      expect(response.body.searchRadius).toBe(5);
      expect(response.body.totalFound).toBe(0);
    });

    it('should return empty array when only offline drivers are nearby', async () => {
      // Clean Redis and set only offline drivers
      await redisService.flushdb();

      await redisService.geoadd('driver:geo', location1.longitude, location1.latitude, driver1Id);
      await redisService.set(
        `driver:location:${driver1Id}`,
        JSON.stringify({
          driverId: driver1Id,
          latitude: location1.latitude,
          longitude: location1.longitude,
          isOnline: false, // OFFLINE
          timestamp: new Date().toISOString(),
        }),
        'EX',
        300,
      );

      const response = await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude })
        .expect(200);

      expect(response.body.drivers).toEqual([]);
      expect(response.body.totalFound).toBe(0);
    });

    it('should return 401 without authentication', async () => {
      await request
        .get('/drivers/search')
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude })
        .expect(401);
    });

    it('should return 400 for invalid latitude (91)', async () => {
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: 91, longitude: searchCenter.longitude })
        .expect(400);
    });

    it('should return 400 for invalid latitude (-91)', async () => {
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: -91, longitude: searchCenter.longitude })
        .expect(400);
    });

    it('should return 400 for invalid longitude (181)', async () => {
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: 181 })
        .expect(400);
    });

    it('should return 400 for invalid longitude (-181)', async () => {
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: -181 })
        .expect(400);
    });

    it('should return 400 for invalid radius (51)', async () => {
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude, radius: 51 })
        .expect(400);
    });

    it('should return 400 for invalid radius (0)', async () => {
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude, radius: 0 })
        .expect(400);
    });

    it('should return 400 for invalid limit (0)', async () => {
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude, limit: 0 })
        .expect(400);
    });

    it('should return 400 for invalid limit (51)', async () => {
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude, limit: 51 })
        .expect(400);
    });

    it('should return 400 for missing latitude', async () => {
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ longitude: searchCenter.longitude })
        .expect(400);
    });

    it('should return 400 for missing longitude', async () => {
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude })
        .expect(400);
    });

    it('should verify distance values are in meters and accurate', async () => {
      const response = await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude })
        .expect(200);

      // driver1 should be ~22m away
      expect(response.body.drivers[0].distance).toBeGreaterThan(0);
      expect(response.body.drivers[0].distance).toBeLessThan(100);

      // driver2 should be ~278m away
      expect(response.body.drivers[1].distance).toBeGreaterThan(200);
      expect(response.body.drivers[1].distance).toBeLessThan(400);

      // Distances should be integers (meters)
      expect(Number.isInteger(response.body.drivers[0].distance)).toBe(true);
      expect(Number.isInteger(response.body.drivers[1].distance)).toBe(true);
    });

    it('should allow any authenticated user (DRIVER or PASSENGER) to search', async () => {
      // Test with driver token
      await request
        .get('/drivers/search')
        .set('Authorization', driverToken)
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude })
        .expect(200);

      // Test with passenger token
      await request
        .get('/drivers/search')
        .set('Authorization', passengerToken)
        .query({ latitude: searchCenter.latitude, longitude: searchCenter.longitude })
        .expect(200);
    });
  });
});
