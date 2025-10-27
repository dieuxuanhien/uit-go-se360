import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { DriverStatusResponseDto } from './dto/driver-status-response.dto';
// import { validate as isUuid } from 'uuid';

@Injectable()
export class DriversService {
  private readonly logger = new Logger(DriversService.name);
  private readonly STATUS_TTL = 3600; // 1 hour in seconds
  private readonly STATUS_KEY_PREFIX = 'driver:status:';
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
}
