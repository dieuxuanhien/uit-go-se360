import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from '../../../src/health/health.controller';
import { DatabaseService } from '../../../src/database/database.service';

describe('HealthController', () => {
  let controller: HealthController;
  let databaseService: DatabaseService;

  const mockDatabaseService = {
    healthCheck: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: DatabaseService,
          useValue: mockDatabaseService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    databaseService = module.get<DatabaseService>(DatabaseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getHealth', () => {
    it('should return healthy status when database is healthy', async () => {
      mockDatabaseService.healthCheck.mockResolvedValue(true);

      const result = await controller.getHealth();

      expect(result).toMatchObject({
        status: 'healthy',
        service: 'user-service',
        version: '1.0.0',
      });
      expect(result.timestamp).toBeDefined();
      expect(databaseService.healthCheck).toHaveBeenCalled();
    });

    it('should return unhealthy status when database is not healthy', async () => {
      mockDatabaseService.healthCheck.mockResolvedValue(false);

      const result = await controller.getHealth();

      expect(result).toMatchObject({
        status: 'unhealthy',
        service: 'user-service',
        version: '1.0.0',
        error: 'Database unavailable',
      });
      expect(result.timestamp).toBeDefined();
      expect(databaseService.healthCheck).toHaveBeenCalled();
    });

    it('should return unhealthy status when database check throws error', async () => {
      mockDatabaseService.healthCheck.mockRejectedValue(
        new Error('Connection timeout'),
      );

      const result = await controller.getHealth();

      expect(result).toMatchObject({
        status: 'unhealthy',
        service: 'user-service',
        version: '1.0.0',
        error: 'Database unavailable',
      });
      expect(result.timestamp).toBeDefined();
      expect(databaseService.healthCheck).toHaveBeenCalled();
    });
  });
});
