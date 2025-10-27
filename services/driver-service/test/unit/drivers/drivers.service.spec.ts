import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ServiceUnavailableException, ForbiddenException } from '@nestjs/common';
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
    geoadd: jest.fn(),
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

  describe('updateLocation', () => {
    const driverId = '550e8400-e29b-41d4-a716-446655440000';
    const validLocationDto = {
      latitude: 10.762622,
      longitude: 106.660172,
      heading: 45,
      speed: 30,
      accuracy: 10,
    };

    it('should update location for online driver', async () => {
      const mockStatus = {
        driverId,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockStatus));
      mockRedisService.geoadd.mockResolvedValue(1);
      mockRedisService.set.mockResolvedValue('OK');

      const result = await service.updateLocation(driverId, validLocationDto);

      expect(result).toHaveProperty('driverId', driverId);
      expect(result).toHaveProperty('latitude', 10.762622);
      expect(result).toHaveProperty('longitude', 106.660172);
      expect(result).toHaveProperty('isOnline', true);
      expect(result).toHaveProperty('heading', 45);
      expect(result).toHaveProperty('speed', 30);
      expect(result).toHaveProperty('accuracy', 10);
      expect(result).toHaveProperty('timestamp');

      // Verify GEOADD was called with correct parameters (lng, lat order)
      expect(mockRedisService.geoadd).toHaveBeenCalledWith(
        'driver:geo',
        106.660172,
        10.762622,
        driverId,
      );

      // Verify SET was called with location data
      expect(mockRedisService.set).toHaveBeenCalledWith(
        `driver:location:${driverId}`,
        expect.stringContaining('"latitude":10.762622'),
        'EX',
        300,
      );
    });

    it('should store location with correct TTL (5 minutes)', async () => {
      const mockStatus = {
        driverId,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockStatus));
      mockRedisService.geoadd.mockResolvedValue(1);
      mockRedisService.set.mockResolvedValue('OK');

      await service.updateLocation(driverId, validLocationDto);

      expect(mockRedisService.set).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'EX',
        300,
      );
    });

    it('should throw ForbiddenException for offline driver', async () => {
      const mockStatus = {
        driverId,
        isOnline: false,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockStatus));

      await expect(service.updateLocation(driverId, validLocationDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw ForbiddenException for non-existent driver status', async () => {
      mockRedisService.get.mockResolvedValue(null);

      await expect(service.updateLocation(driverId, validLocationDto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should validate latitude bounds (-90 to 90)', async () => {
      const mockStatus = {
        driverId,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockStatus));
      mockRedisService.geoadd.mockResolvedValue(1);
      mockRedisService.set.mockResolvedValue('OK');

      // Valid latitude at boundaries
      await expect(
        service.updateLocation(driverId, { ...validLocationDto, latitude: -90 }),
      ).resolves.toBeDefined();

      await expect(
        service.updateLocation(driverId, { ...validLocationDto, latitude: 90 }),
      ).resolves.toBeDefined();
    });

    it('should validate longitude bounds (-180 to 180)', async () => {
      const mockStatus = {
        driverId,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockStatus));
      mockRedisService.geoadd.mockResolvedValue(1);
      mockRedisService.set.mockResolvedValue('OK');

      // Valid longitude at boundaries
      await expect(
        service.updateLocation(driverId, { ...validLocationDto, longitude: -180 }),
      ).resolves.toBeDefined();

      await expect(
        service.updateLocation(driverId, { ...validLocationDto, longitude: 180 }),
      ).resolves.toBeDefined();
    });

    it('should store optional fields correctly', async () => {
      const mockStatus = {
        driverId,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockStatus));
      mockRedisService.geoadd.mockResolvedValue(1);
      mockRedisService.set.mockResolvedValue('OK');

      const dtoWithoutOptionals = {
        latitude: 10.762622,
        longitude: 106.660172,
      };

      const result = await service.updateLocation(driverId, dtoWithoutOptionals);

      expect(result).toHaveProperty('driverId', driverId);
      expect(result).toHaveProperty('latitude', 10.762622);
      expect(result).toHaveProperty('longitude', 106.660172);
      expect(result).toHaveProperty('heading', undefined);
      expect(result).toHaveProperty('speed', undefined);
      expect(result).toHaveProperty('accuracy', undefined);
    });

    it('should set timestamp to current time', async () => {
      const mockStatus = {
        driverId,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.get.mockResolvedValue(JSON.stringify(mockStatus));
      mockRedisService.geoadd.mockResolvedValue(1);
      mockRedisService.set.mockResolvedValue('OK');

      const beforeTime = new Date().getTime();
      const result = await service.updateLocation(driverId, validLocationDto);
      const afterTime = new Date().getTime();

      const resultTime = new Date(result.timestamp).getTime();
      expect(resultTime).toBeGreaterThanOrEqual(beforeTime);
      expect(resultTime).toBeLessThanOrEqual(afterTime);
    });

    it('should throw ServiceUnavailableException when Redis fails', async () => {
      mockRedisService.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.updateLocation(driverId, validLocationDto)).rejects.toThrow(
        ServiceUnavailableException,
      );
    });

    it('should throw error for invalid UUID', async () => {
      await expect(service.updateLocation('invalid-uuid', validLocationDto)).rejects.toThrow();
    });
  });
});
