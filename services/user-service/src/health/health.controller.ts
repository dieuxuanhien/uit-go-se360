import { Controller, Get } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * Health Check Controller
 * Provides endpoints to verify service and database status
 */
@Controller('health')
export class HealthController {
  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Health Check Endpoint
   * Returns 200 OK if service is healthy, 503 if database is unreachable
   * @returns {object} Service status and database connectivity information
   * @example
   * GET /health
   * Response (200): {
   *   "status": "healthy",
   *   "service": "user-service",
   *   "version": "1.0.0",
   *   "timestamp": "2025-10-26T10:30:00.000Z"
   * }
   *
   * Response (503): {
   *   "status": "unhealthy",
   *   "service": "user-service",
   *   "version": "1.0.0",
   *   "timestamp": "2025-10-26T10:30:00.000Z",
   *   "error": "Database unavailable"
   * }
   */
  @Get()
  async getHealth() {
    try {
      const dbHealthy = await this.databaseService.healthCheck();

      if (!dbHealthy) {
        return {
          status: 'unhealthy',
          service: 'user-service',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          error: 'Database unavailable',
        };
      }

      return {
        status: 'healthy',
        service: 'user-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        service: 'user-service',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        error: 'Database unavailable',
      };
    }
  }
}
