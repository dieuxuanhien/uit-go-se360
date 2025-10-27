import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  ForbiddenException,
} from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { DriverStatusResponseDto } from './dto/driver-status-response.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { DriverLocationResponseDto } from './dto/driver-location-response.dto';
import { SearchNearbyDriversResponseDto } from './dto/search-nearby-drivers-response.dto';
import { NearbyDriverResponseDto } from './dto/nearby-driver-response.dto';
// import { validate as isUuid } from 'uuid';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);
  private readonly STATUS_TTL = 3600; // 1 hour in seconds
  private readonly LOCATION_TTL = 300; // 5 minutes in seconds
  private readonly STATUS_KEY_PREFIX = 'driver:status:';
  private readonly LOCATION_KEY_PREFIX = 'driver:location:';
  private readonly GEO_INDEX_KEY = 'driver:geo';
  private readonly ONLINE_DRIVERS_SET = 'driver:online';

  constructor(private readonly redisService: RedisService) {}

  private isValidUuid(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  async updateStatus(driverId: string, isOnline: boolean): Promise<DriverStatusResponseDto> {
    // Validate UUID
    if (!this.isValidUuid(driverId)) {
      throw new Error('Invalid driver ID format');
    }

    const timestamp = new Date().toISOString();
    const statusData = {
      driverId,
      isOnline,
      timestamp,
    };

    const key = `${this.STATUS_KEY_PREFIX}${driverId}`;

    try {
      // Store status in Redis with TTL
      await this.redisService.set(key, JSON.stringify(statusData), 'EX', this.STATUS_TTL);

      // Update online drivers set
      if (isOnline) {
        await this.redisService.sadd(this.ONLINE_DRIVERS_SET, driverId);
        this.logger.log(`Driver ${driverId} is now ONLINE`);
      } else {
        await this.redisService.srem(this.ONLINE_DRIVERS_SET, driverId);
        this.logger.log(`Driver ${driverId} is now OFFLINE`);
      }

      return statusData;
    } catch (error) {
      this.logger.error('Failed to update driver status', { driverId, error });
      throw new ServiceUnavailableException('Status service temporarily unavailable');
    }
  }

  async getStatus(driverId: string): Promise<DriverStatusResponseDto> {
    // Validate UUID
    if (!this.isValidUuid(driverId)) {
      throw new Error('Invalid driver ID format');
    }

    const key = `${this.STATUS_KEY_PREFIX}${driverId}`;

    try {
      const statusJson = await this.redisService.get(key);

      if (!statusJson) {
        throw new NotFoundException(`Driver status not found for ID: ${driverId}`);
      }

      const status = JSON.parse(statusJson);
      return status;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Failed to retrieve driver status', { driverId, error });
      throw new ServiceUnavailableException('Status service temporarily unavailable');
    }
  }

  async updateLocation(
    driverId: string,
    dto: UpdateLocationDto,
  ): Promise<DriverLocationResponseDto> {
    // Validate UUID
    if (!this.isValidUuid(driverId)) {
      throw new Error('Invalid driver ID format');
    }

    const statusKey = `${this.STATUS_KEY_PREFIX}${driverId}`;
    const locationKey = `${this.LOCATION_KEY_PREFIX}${driverId}`;

    try {
      // Check driver status in Redis
      const statusJson = await this.redisService.get(statusKey);

      if (!statusJson) {
        throw new ForbiddenException('Driver must be online to update location');
      }

      const status = JSON.parse(statusJson);
      if (!status.isOnline) {
        throw new ForbiddenException('Driver must be online to update location');
      }

      const timestamp = new Date().toISOString();
      const locationData: DriverLocationResponseDto = {
        driverId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        isOnline: true,
        heading: dto.heading,
        speed: dto.speed,
        accuracy: dto.accuracy,
        timestamp,
      };

      // Store location in Redis geospatial index (GEOADD uses lng, lat order)
      await this.redisService.geoadd(this.GEO_INDEX_KEY, dto.longitude, dto.latitude, driverId);

      // Store location metadata
      await this.redisService.set(
        locationKey,
        JSON.stringify(locationData),
        'EX',
        this.LOCATION_TTL,
      );

      this.logger.log('Location updated', {
        driverId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        timestamp,
      });

      return locationData;
    } catch (error) {
      if (error instanceof ForbiddenException) {
        throw error;
      }
      this.logger.error('Redis operation failed', {
        error,
        driverId,
        operation: 'updateLocation',
      });
      throw new ServiceUnavailableException('Location service temporarily unavailable');
    }
  }

  async searchNearbyDrivers(
    latitude: number,
    longitude: number,
    radius: number,
    limit: number,
  ): Promise<SearchNearbyDriversResponseDto> {
    const start = Date.now();

    try {
      // Execute GEORADIUS query (note: longitude first, then latitude)
      const results = await this.redisService.georadius(
        this.GEO_INDEX_KEY,
        longitude, // longitude first!
        latitude, // latitude second!
        radius,
        'km',
        'WITHDIST',
        'ASC',
        'COUNT',
        limit,
      );

      const executionTimeMs = Date.now() - start;

      if (executionTimeMs > 500) {
        this.logger.warn('Geospatial search exceeded 500ms threshold', {
          latitude,
          longitude,
          radius,
          executionTimeMs,
        });
      }

      // If no results, return empty array
      if (!results || results.length === 0) {
        this.logger.log('Nearby drivers search', {
          latitude,
          longitude,
          radius,
          totalFound: 0,
          executionTimeMs,
        });

        return {
          drivers: [],
          searchRadius: radius,
          totalFound: 0,
        };
      }

      // Extract driver IDs from results
      // GEORADIUS WITHDIST returns: [[driverId, distance], [driverId, distance], ...]
      const driverIds: string[] = [];
      const distanceMap: { [key: string]: number } = {};

      for (const result of results) {
        const driverId = (result as [string, string])[0];
        const distanceKm = parseFloat((result as [string, string])[1]);
        driverIds.push(driverId);
        distanceMap[driverId] = distanceKm;
      }

      // Fetch metadata for all drivers
      const metadataKeys = driverIds.map((id) => `${this.LOCATION_KEY_PREFIX}${id}`);
      const metadataValues = await this.redisService.mget(...metadataKeys);

      // Parse metadata and filter to online drivers only
      const onlineDrivers: NearbyDriverResponseDto[] = [];

      for (let i = 0; i < metadataValues.length; i++) {
        const metadataJson = metadataValues[i];

        if (!metadataJson) {
          // Key expired or doesn't exist, skip
          continue;
        }

        try {
          const metadata = JSON.parse(metadataJson);

          // Only include online drivers
          if (metadata.isOnline) {
            onlineDrivers.push({
              driverId: metadata.driverId,
              latitude: metadata.latitude,
              longitude: metadata.longitude,
              distance: Math.round(distanceMap[metadata.driverId] * 1000), // Convert km to meters
              isOnline: true,
            });
          }
        } catch (parseError) {
          this.logger.warn('Failed to parse driver metadata', {
            driverId: driverIds[i],
            error: parseError,
          });
          continue;
        }
      }

      this.logger.log('Nearby drivers search', {
        latitude,
        longitude,
        radius,
        totalFound: onlineDrivers.length,
        executionTimeMs,
      });

      return {
        drivers: onlineDrivers,
        searchRadius: radius,
        totalFound: onlineDrivers.length,
      };
    } catch (error) {
      this.logger.error('Redis geospatial search failed', {
        error,
        latitude,
        longitude,
        radius,
        operation: 'searchNearbyDrivers',
      });
      throw new ServiceUnavailableException('Driver search service temporarily unavailable');
    }
  }
}
