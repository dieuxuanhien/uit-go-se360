import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RedisService } from '../redis/redis.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly redisService: RedisService) {}

  @Get()
  @ApiOperation({ summary: 'Service health check' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'healthy' },
        timestamp: { type: 'string', format: 'date-time' },
        service: { type: 'string', example: 'driver-service' },
        version: { type: 'string', example: '1.0.0' },
        redis: { type: 'string', example: 'connected' },
      },
    },
  })
  @ApiResponse({ status: 503, description: 'Service unavailable' })
  async check() {
    const isRedisHealthy = await this.redisService.healthCheck();

    if (!isRedisHealthy) {
      throw new ServiceUnavailableException({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'driver-service',
        version: '0.1.0',
        redis: 'disconnected',
      });
    }

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'driver-service',
      version: '0.1.0',
      redis: 'connected',
    };
  }
}
