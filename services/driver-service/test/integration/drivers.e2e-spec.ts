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
});
