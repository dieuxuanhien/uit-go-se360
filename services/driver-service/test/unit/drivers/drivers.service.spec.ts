import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DriversService } from '../../../src/drivers/drivers.service';
import { RedisService } from '../../../src/redis/redis.service';

describe('DriversService', () => {
  let service: DriversService;
  let _redisService: RedisService;

  const mockRedisService = {
    set: jest.fn(),
    get: jest.fn(),
    sadd: jest.fn(),
    srem: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DriversService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<DriversService>(DriversService);
    _redisService = module.get<RedisService>(RedisService);

    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateStatus', () => {
    const driverId = '550e8400-e29b-41d4-a716-446655440000';

    it('should set driver status to online', async () => {
      mockRedisService.set.mockResolvedValue('OK');
      mockRedisService.sadd.mockResolvedValue(1);

      const result = await service.updateStatus(driverId, true);

      expect(result).toHaveProperty('driverId', driverId);
      expect(result).toHaveProperty('isOnline', true);
      expect(result).toHaveProperty('timestamp');
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `driver:status:${driverId}`,
        expect.any(String),
        'EX',
        3600,
      );
      expect(mockRedisService.sadd).toHaveBeenCalledWith('driver:online', driverId);
    });

    it('should set driver status to offline', async () => {
      mockRedisService.set.mockResolvedValue('OK');
      mockRedisService.srem.mockResolvedValue(1);

      const result = await service.updateStatus(driverId, false);

      expect(result).toHaveProperty('driverId', driverId);
      expect(result).toHaveProperty('isOnline', false);
      expect(result).toHaveProperty('timestamp');
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `driver:status:${driverId}`,
        expect.any(String),
        'EX',
        3600,
      );
      expect(mockRedisService.srem).toHaveBeenCalledWith('driver:online', driverId);
    });

    it('should set correct TTL (1 hour) on Redis keys', async () => {
      mockRedisService.set.mockResolvedValue('OK');
      mockRedisService.sadd.mockResolvedValue(1);

      await service.updateStatus(driverId, true);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'EX',
        3600,
      );
    });

    it('should throw ServiceUnavailableException when Redis fails', async () => {
      mockRedisService.set.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.updateStatus(driverId, true)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw error for invalid UUID', async () => {
      await expect(service.updateStatus('invalid-uuid', true)).rejects.toThrow();
    });
  });

  describe('getStatus', () => {
    const driverId = '550e8400-e29b-41d4-a716-446655440000';

    it('should return status for existing driver', async () => {
      const mockStatus = {
        driverId,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockStatus));

      const result = await service.getStatus(driverId);

      expect(result).toEqual(mockStatus);
      expect(mockRedisService.get).toHaveBeenCalledWith(`driver:status:${driverId}`);
    });

    it('should return 404 for non-existent status', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.getStatus(driverId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ServiceUnavailableException when Redis fails', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.getStatus(driverId)).rejects.toThrow(ServiceUnavailableException);
    });

    it('should throw error for invalid UUID', async () => {
      await expect(service.getStatus('invalid-uuid')).rejects.toThrow();
    });
  });
});
