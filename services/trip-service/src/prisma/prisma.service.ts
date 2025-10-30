import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Prisma Service manages Prisma Client lifecycle.
 * Handles connection to PostgreSQL database and graceful shutdown.
 */
@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  /**
   * Initialize Prisma Client connection on module init
   */
  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('✓ Connected to PostgreSQL database');
    } catch (error) {
      this.logger.error('✗ Failed to connect to database', error);
      throw error;
    }
  }

  /**
   * Gracefully disconnect from database on module destroy
   */
  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('✓ Disconnected from database');
    } catch (error) {
      this.logger.error('✗ Failed to disconnect from database', error);
      throw error;
    }
  }

  /**
   * Check database connectivity
   * Used by health check endpoint
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Database connection check failed', error);
      return false;
    }
  }
}
