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
    georadius: jest.fn(),
    mget: jest.fn(),
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

  describe('searchNearbyDrivers', () => {
    const searchParams = {
      latitude: 10.762622,
      longitude: 106.660172,
      radius: 5,
      limit: 10,
    };

    it('should return nearby online drivers sorted by distance', async () => {
      const driver1Id = '550e8400-e29b-41d4-a716-446655440001';
      const driver2Id = '550e8400-e29b-41d4-a716-446655440002';

      // Mock GEORADIUS response (returns [driverId, distance_km] pairs)
      mockRedisService.georadius.mockResolvedValue([
        [driver1Id, '0.150'], // 150 meters
        [driver2Id, '0.320'], // 320 meters
      ]);

      // Mock MGET response with location metadata
      const metadata1 = {
        driverId: driver1Id,
        latitude: 10.762822,
        longitude: 106.660372,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      const metadata2 = {
        driverId: driver2Id,
        latitude: 10.765122,
        longitude: 106.662172,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.mget.mockResolvedValue([
        JSON.stringify(metadata1),
        JSON.stringify(metadata2),
      ]);

      const result = await service.searchNearbyDrivers(
        searchParams.latitude,
        searchParams.longitude,
        searchParams.radius,
        searchParams.limit,
      );

      expect(result.drivers).toHaveLength(2);
      expect(result.drivers[0]).toEqual({
        driverId: driver1Id,
        latitude: 10.762822,
        longitude: 106.660372,
        distance: 150, // km to meters conversion
        isOnline: true,
      });
      expect(result.drivers[1]).toEqual({
        driverId: driver2Id,
        latitude: 10.765122,
        longitude: 106.662172,
        distance: 320,
        isOnline: true,
      });
      expect(result.searchRadius).toBe(5);
      expect(result.totalFound).toBe(2);

      // Verify GEORADIUS called with correct parameters (longitude first!)
      expect(mockRedisService.georadius).toHaveBeenCalledWith(
        'driver:geo',
        106.660172, // longitude first
        10.762622, // latitude second
        5,
        'km',
        'WITHDIST',
        'ASC',
        'COUNT',
        10,
      );

      // Verify MGET called with correct keys
      expect(mockRedisService.mget).toHaveBeenCalledWith(
        `driver:location:${driver1Id}`,
        `driver:location:${driver2Id}`,
      );
    });

    it('should filter out offline drivers', async () => {
      const driver1Id = '550e8400-e29b-41d4-a716-446655440001';
      const driver2Id = '550e8400-e29b-41d4-a716-446655440002';
      const driver3Id = '550e8400-e29b-41d4-a716-446655440003';

      // Mock GEORADIUS with 3 drivers
      mockRedisService.georadius.mockResolvedValue([
        [driver1Id, '0.150'],
        [driver2Id, '0.320'],
        [driver3Id, '0.450'],
      ]);

      // Mock MGET: driver1 online, driver2 offline, driver3 online
      const metadata1 = {
        driverId: driver1Id,
        latitude: 10.762822,
        longitude: 106.660372,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      const metadata2 = {
        driverId: driver2Id,
        latitude: 10.765122,
        longitude: 106.662172,
        isOnline: false, // OFFLINE
        timestamp: new Date().toISOString(),
      };
      const metadata3 = {
        driverId: driver3Id,
        latitude: 10.767122,
        longitude: 106.664172,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.mget.mockResolvedValue([
        JSON.stringify(metadata1),
        JSON.stringify(metadata2),
        JSON.stringify(metadata3),
      ]);

      const result = await service.searchNearbyDrivers(
        searchParams.latitude,
        searchParams.longitude,
        searchParams.radius,
        searchParams.limit,
      );

      // Should only return 2 online drivers (driver2 filtered out)
      expect(result.drivers).toHaveLength(2);
      expect(result.drivers.find((d) => d.driverId === driver1Id)).toBeDefined();
      expect(result.drivers.find((d) => d.driverId === driver2Id)).toBeUndefined();
      expect(result.drivers.find((d) => d.driverId === driver3Id)).toBeDefined();
      expect(result.totalFound).toBe(2);
    });

    it('should convert distance from km to meters', async () => {
      const driverId = '550e8400-e29b-41d4-a716-446655440001';

      mockRedisService.georadius.mockResolvedValue([[driverId, '1.5']]); // 1.5 km

      const metadata = {
        driverId,
        latitude: 10.762822,
        longitude: 106.660372,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.mget.mockResolvedValue([JSON.stringify(metadata)]);

      const result = await service.searchNearbyDrivers(
        searchParams.latitude,
        searchParams.longitude,
        searchParams.radius,
        searchParams.limit,
      );

      expect(result.drivers[0].distance).toBe(1500); // 1.5 km = 1500 meters
    });

    it('should return empty array when no drivers found', async () => {
      mockRedisService.georadius.mockResolvedValue([]);

      const result = await service.searchNearbyDrivers(
        searchParams.latitude,
        searchParams.longitude,
        searchParams.radius,
        searchParams.limit,
      );

      expect(result.drivers).toEqual([]);
      expect(result.searchRadius).toBe(5);
      expect(result.totalFound).toBe(0);
    });

    it('should return empty array when all nearby drivers are offline', async () => {
      const driver1Id = '550e8400-e29b-41d4-a716-446655440001';
      const driver2Id = '550e8400-e29b-41d4-a716-446655440002';

      mockRedisService.georadius.mockResolvedValue([
        [driver1Id, '0.150'],
        [driver2Id, '0.320'],
      ]);

      // Both drivers offline
      const metadata1 = {
        driverId: driver1Id,
        latitude: 10.762822,
        longitude: 106.660372,
        isOnline: false,
        timestamp: new Date().toISOString(),
      };
      const metadata2 = {
        driverId: driver2Id,
        latitude: 10.765122,
        longitude: 106.662172,
        isOnline: false,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.mget.mockResolvedValue([
        JSON.stringify(metadata1),
        JSON.stringify(metadata2),
      ]);

      const result = await service.searchNearbyDrivers(
        searchParams.latitude,
        searchParams.longitude,
        searchParams.radius,
        searchParams.limit,
      );

      expect(result.drivers).toEqual([]);
      expect(result.totalFound).toBe(0);
    });

    it('should pass limit parameter correctly to GEORADIUS', async () => {
      mockRedisService.georadius.mockResolvedValue([]);

      await service.searchNearbyDrivers(
        searchParams.latitude,
        searchParams.longitude,
        searchParams.radius,
        20, // custom limit
      );

      expect(mockRedisService.georadius).toHaveBeenCalledWith(
        'driver:geo',
        expect.any(Number),
        expect.any(Number),
        expect.any(Number),
        'km',
        'WITHDIST',
        'ASC',
        'COUNT',
        20, // verify limit passed correctly
      );
    });

    it('should pass radius parameter correctly to GEORADIUS', async () => {
      mockRedisService.georadius.mockResolvedValue([]);

      await service.searchNearbyDrivers(
        searchParams.latitude,
        searchParams.longitude,
        10, // custom radius
        searchParams.limit,
      );

      expect(mockRedisService.georadius).toHaveBeenCalledWith(
        'driver:geo',
        expect.any(Number),
        expect.any(Number),
        10, // verify radius passed correctly
        'km',
        'WITHDIST',
        'ASC',
        'COUNT',
        expect.any(Number),
      );
    });

    it('should handle expired location keys gracefully', async () => {
      const driver1Id = '550e8400-e29b-41d4-a716-446655440001';
      const driver2Id = '550e8400-e29b-41d4-a716-446655440002';

      mockRedisService.georadius.mockResolvedValue([
        [driver1Id, '0.150'],
        [driver2Id, '0.320'],
      ]);

      // driver1 metadata exists, driver2 expired (null)
      const metadata1 = {
        driverId: driver1Id,
        latitude: 10.762822,
        longitude: 106.660372,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.mget.mockResolvedValue([JSON.stringify(metadata1), null]);

      const result = await service.searchNearbyDrivers(
        searchParams.latitude,
        searchParams.longitude,
        searchParams.radius,
        searchParams.limit,
      );

      // Should only return driver1 (driver2 skipped due to expired key)
      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].driverId).toBe(driver1Id);
      expect(result.totalFound).toBe(1);
    });

    it('should handle malformed JSON gracefully', async () => {
      const driver1Id = '550e8400-e29b-41d4-a716-446655440001';
      const driver2Id = '550e8400-e29b-41d4-a716-446655440002';

      mockRedisService.georadius.mockResolvedValue([
        [driver1Id, '0.150'],
        [driver2Id, '0.320'],
      ]);

      // driver1 valid JSON, driver2 malformed
      const metadata1 = {
        driverId: driver1Id,
        latitude: 10.762822,
        longitude: 106.660372,
        isOnline: true,
        timestamp: new Date().toISOString(),
      };
      mockRedisService.mget.mockResolvedValue([JSON.stringify(metadata1), 'invalid-json']);

      const result = await service.searchNearbyDrivers(
        searchParams.latitude,
        searchParams.longitude,
        searchParams.radius,
        searchParams.limit,
      );

      // Should only return driver1 (driver2 skipped due to parse error)
      expect(result.drivers).toHaveLength(1);
      expect(result.drivers[0].driverId).toBe(driver1Id);
      expect(result.totalFound).toBe(1);
    });

    it('should throw ServiceUnavailableException when Redis fails', async () => {
      mockRedisService.georadius.mockRejectedValue(new Error('Redis connection failed'));

      await expect(
        service.searchNearbyDrivers(
          searchParams.latitude,
          searchParams.longitude,
          searchParams.radius,
          searchParams.limit,
        ),
      ).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
