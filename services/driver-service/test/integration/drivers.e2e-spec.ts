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
});
