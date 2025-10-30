import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';

describe('Health Check (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/health (GET) should return 200 with health status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveProperty('status', 'healthy');
        expect(res.body).toHaveProperty('service', 'trip-service');
        expect(res.body).toHaveProperty('version', '1.0.0');
        expect(res.body).toHaveProperty('timestamp');
        expect(res.body).toHaveProperty('database', 'connected');
      });
  });

  it('/health (GET) should be accessible without authentication', () => {
    return request(app.getHttpServer()).get('/health').expect(200);
  });

  it('/health (GET) should return valid JSON structure', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect('Content-Type', /json/)
      .expect((res) => {
        expect(typeof res.body).toBe('object');
        expect(typeof res.body.status).toBe('string');
        expect(typeof res.body.service).toBe('string');
        expect(typeof res.body.version).toBe('string');
        expect(typeof res.body.timestamp).toBe('string');
        expect(typeof res.body.database).toBe('string');
      });
  });
});
