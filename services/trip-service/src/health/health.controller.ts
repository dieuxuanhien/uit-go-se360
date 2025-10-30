import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Health Check Controller
 * Provides endpoints to verify service and database status
 */
@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly prismaService: PrismaService) {}

  /**
   * Health Check Endpoint
   * Returns 200 OK if service is healthy, 503 if database is unreachable
   * @returns {object} Service status and database connectivity information
   */
  @Get()
  @ApiOperation({ summary: 'Check service health' })
  @ApiResponse({
    status: 200,
    description: 'Service is healthy',
    schema: {
      example: {
        status: 'healthy',
        service: 'trip-service',
        version: '1.0.0',
        timestamp: '2025-10-29T10:30:00.000Z',
        database: 'connected',
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Service is unhealthy',
    schema: {
      example: {
        status: 'unhealthy',
        service: 'trip-service',
        version: '1.0.0',
        timestamp: '2025-10-29T10:30:00.000Z',
        database: 'disconnected',
        error: 'Database connection failed',
      },
    },
  })
  async checkHealth() {
    try {
      const isConnected = await this.prismaService.checkConnection();

      if (!isConnected) {
        throw new ServiceUnavailableException({
          status: 'unhealthy',
          service: 'trip-service',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          database: 'disconnected',
          error: 'Database unavailable',
        });
      }

      return {
        status: 'healthy',
        service: 'trip-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        database: 'connected',
      };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'unhealthy',
        service: 'trip-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error.message || 'Database unavailable',
      });
    }
  }
}
