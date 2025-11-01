import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { DatabaseService } from '../src/database/database.service';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

describe('Authentication (e2e)', () => {
  let app: INestApplication;
  let databaseService: DatabaseService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
  });

  afterAll(async () => {
    await databaseService.$disconnect();
    await app.close();
  });

  beforeEach(async () => {
    // Clean database before each test - delete users (driver profiles cascade)
    await databaseService.user.deleteMany();
  });

  describe('POST /users/register', () => {
    const validRegistration = {
      email: 'test@example.com',
      password: 'password123',
      role: 'PASSENGER',
      firstName: 'John',
      lastName: 'Doe',
      phoneNumber: '+84123456789',
    };

    it('should register new user successfully (AC 1, 4)', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send(validRegistration)
        .expect(201);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toMatchObject({
        email: validRegistration.email,
        role: validRegistration.role,
        firstName: validRegistration.firstName,
        lastName: validRegistration.lastName,
        phoneNumber: validRegistration.phoneNumber,
      });
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('createdAt');
      expect(response.body.user).toHaveProperty('updatedAt');
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should reject duplicate email (AC 2)', async () => {
      // Register first user
      await request(app.getHttpServer())
        .post('/users/register')
        .send(validRegistration)
        .expect(201);

      // Try to register with same email
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send(validRegistration)
        .expect(409);

      expect(response.body.error).toHaveProperty('code', 'CONFLICT');
      expect(response.body.error.message).toContain('already registered');
    });

    it('should hash password with bcrypt (AC 3)', async () => {
      await request(app.getHttpServer())
        .post('/users/register')
        .send(validRegistration)
        .expect(201);

      // Check password is hashed in database
      const user = await databaseService.user.findUnique({
        where: { email: validRegistration.email },
      });

      expect(user).toBeDefined();
      expect(user!.passwordHash).not.toBe(validRegistration.password);
      expect(user!.passwordHash).toMatch(/^\$2[aby]\$\d{1,2}\$/); // bcrypt pattern
    });

    it('should reject weak password (AC 3, 14)', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({ ...validRegistration, password: 'short' })
        .expect(400);

      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should reject invalid email (AC 14)', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({ ...validRegistration, email: 'not-an-email' })
        .expect(400);

      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should reject missing required fields (AC 14)', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({ email: 'test@example.com', password: 'password123' })
        .expect(400);

      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });

    it('should reject invalid role (AC 14)', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({ ...validRegistration, role: 'INVALID_ROLE' })
        .expect(400);

      expect(response.body.error).toHaveProperty('code', 'VALIDATION_ERROR');
    });
  });

  describe('POST /users/login', () => {
    const credentials = {
      email: 'login@example.com',
      password: 'password123',
    };

    beforeEach(async () => {
      // Register a user for login tests
      await request(app.getHttpServer())
        .post('/users/register')
        .send({
          ...credentials,
          role: 'PASSENGER',
          firstName: 'Jane',
          lastName: 'Smith',
          phoneNumber: '+84987654321',
        });
    });

    it('should login with valid credentials (AC 5, 6)', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/login')
        .send(credentials)
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(credentials.email);
      expect(response.body.user).not.toHaveProperty('passwordHash');
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should reject invalid email (AC 7)', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/login')
        .send({ ...credentials, email: 'wrong@example.com' })
        .expect(401);

      expect(response.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });

    it('should reject invalid password (AC 7)', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/login')
        .send({ ...credentials, password: 'wrongpassword' })
        .expect(401);

      expect(response.body.error).toHaveProperty('code', 'UNAUTHORIZED');
    });
  });

  describe('JWT Token', () => {
    let accessToken: string;
    let userId: string;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({
          email: 'jwt@example.com',
          password: 'password123',
          role: 'DRIVER',
          firstName: 'JWT',
          lastName: 'Test',
          phoneNumber: '+84111222333',
        });

      accessToken = response.body.accessToken;
      userId = response.body.user.id;
    });

    it('should contain userId, email, and role claims (AC 8)', () => {
      // Decode JWT token (without verification for testing)
      const [, payloadBase64] = accessToken.split('.');
      const payload = JSON.parse(
        Buffer.from(payloadBase64, 'base64').toString(),
      );

      expect(payload).toHaveProperty('userId', userId);
      expect(payload).toHaveProperty('email', 'jwt@example.com');
      expect(payload).toHaveProperty('role', 'DRIVER');
    });

    it('should have expiration time (AC 9)', () => {
      const [, payloadBase64] = accessToken.split('.');
      const payload = JSON.parse(
        Buffer.from(payloadBase64, 'base64').toString(),
      );

      expect(payload).toHaveProperty('exp');
      expect(payload).toHaveProperty('iat');

      // Verify expiration is set (24 hours = 86400 seconds)
      const expirationDuration = payload.exp - payload.iat;
      expect(expirationDuration).toBeGreaterThan(0);
    });

    it('should reject invalid token (AC 10)', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.error).toBeDefined();
    });

    it('should reject missing token (AC 10)', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });
  });

  describe('GET /users/me', () => {
    let accessToken: string;
    let user: any;

    beforeEach(async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({
          email: 'profile@example.com',
          password: 'password123',
          role: 'PASSENGER',
          firstName: 'Profile',
          lastName: 'User',
          phoneNumber: '+84444555666',
        });

      accessToken = response.body.accessToken;
      user = response.body.user;
    });

    it('should return authenticated user profile (AC 11)', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: user.id,
        email: user.email,
        role: user.role,
        firstName: user.firstName,
        lastName: user.lastName,
        phoneNumber: user.phoneNumber,
      });
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should reject request without token (AC 10)', async () => {
      await request(app.getHttpServer()).get('/users/me').expect(401);
    });
  });

  describe('Error Response Format (AC 13)', () => {
    it('should return consistent error format', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/register')
        .send({ email: 'bad-data' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error).toHaveProperty('timestamp');
      expect(response.body.error).toHaveProperty('requestId');
    });
  });
});
