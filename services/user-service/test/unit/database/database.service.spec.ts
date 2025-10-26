import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { DatabaseService } from '../../../src/database/database.service';

describe('DatabaseService', () => {
  let service: DatabaseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DatabaseService],
    }).compile();

    service = module.get<DatabaseService>(DatabaseService);

    // Mock the logger to avoid log output during tests
    jest.spyOn(Logger.prototype, 'log').mockImplementation();
    jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should connect to database successfully', async () => {
      const connectSpy = jest.spyOn(service, '$connect').mockResolvedValue();

      await service.onModuleInit();

      expect(connectSpy).toHaveBeenCalled();
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        '✓ Connected to PostgreSQL database',
      );
    });

    it('should log error and throw when connection fails', async () => {
      const error = new Error('Connection failed');
      jest.spyOn(service, '$connect').mockRejectedValue(error);

      await expect(service.onModuleInit()).rejects.toThrow(error);
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        '✗ Failed to connect to database',
        error,
      );
    });
  });

  describe('onModuleDestroy', () => {
    it('should disconnect from database successfully', async () => {
      const disconnectSpy = jest
        .spyOn(service, '$disconnect')
        .mockResolvedValue();

      await service.onModuleDestroy();

      expect(disconnectSpy).toHaveBeenCalled();
      expect(Logger.prototype.log).toHaveBeenCalledWith(
        '✓ Disconnected from database',
      );
    });

    it('should log error and throw when disconnection fails', async () => {
      const error = new Error('Disconnection failed');
      jest.spyOn(service, '$disconnect').mockRejectedValue(error);

      await expect(service.onModuleDestroy()).rejects.toThrow(error);
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        '✗ Failed to disconnect from database',
        error,
      );
    });
  });

  describe('healthCheck', () => {
    it('should return true when database is healthy', async () => {
      jest.spyOn(service, '$queryRaw').mockResolvedValue([]);

      const result = await service.healthCheck();

      expect(result).toBe(true);
      expect(service.$queryRaw).toHaveBeenCalled();
    });

    it('should return false when database check fails', async () => {
      const error = new Error('Query failed');
      jest.spyOn(service, '$queryRaw').mockRejectedValue(error);

      const result = await service.healthCheck();

      expect(result).toBe(false);
      expect(Logger.prototype.error).toHaveBeenCalledWith(
        'Database health check failed',
        error,
      );
    });
  });
});
