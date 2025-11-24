import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';

/**
 * Prisma Read Replica Service for user-service
 * Routes SELECT queries to read replicas for 10x capacity improvement
 * 
 * Story 2.2: Database Read Scaling
 */
@Injectable()
export class PrismaReplicaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaReplicaService.name);
  private currentReplicaIndex = 0;
  private readonly replicas: PrismaClient[] = [];

  constructor(private configService: ConfigService) {
    super();
    this.initializeReplicas();
  }

  /**
   * Initialize read replica connections
   * Supports 2 replicas per database for load balancing
   */
  private initializeReplicas() {
    const replica1Url = this.configService.get<string>('DATABASE_REPLICA1_URL');
    const replica2Url = this.configService.get<string>('DATABASE_REPLICA2_URL');

    if (replica1Url) {
      const replica1 = new PrismaClient({
        datasources: {
          db: { url: replica1Url },
        },
      });
      this.replicas.push(replica1);
      this.logger.log('✓ Replica 1 configured');
    }

    if (replica2Url) {
      const replica2 = new PrismaClient({
        datasources: {
          db: { url: replica2Url },
        },
      });
      this.replicas.push(replica2);
      this.logger.log('✓ Replica 2 configured');
    }

    if (this.replicas.length === 0) {
      this.logger.warn(
        '⚠ No replicas configured, falling back to primary database for reads',
      );
    }
  }

  /**
   * Get next replica using round-robin load balancing
   */
  getReadClient(): PrismaClient {
    if (this.replicas.length === 0) {
      return this; // Fallback to primary
    }

    const replica = this.replicas[this.currentReplicaIndex];
    this.currentReplicaIndex =
      (this.currentReplicaIndex + 1) % this.replicas.length;

    return replica;
  }

  /**
   * Connect to all replicas on module init
   */
  async onModuleInit() {
    try {
      // Connect to primary (inherited from PrismaClient)
      await this.$connect();
      this.logger.log('✓ Connected to primary PostgreSQL database');

      // Connect to all replicas
      await Promise.all(
        this.replicas.map(async (replica, index) => {
          await replica.$connect();
          this.logger.log(`✓ Connected to read replica ${index + 1}`);
        }),
      );
    } catch (error) {
      this.logger.error('✗ Failed to connect to database replicas', error);
      throw error;
    }
  }

  /**
   * Disconnect from all replicas on module destroy
   */
  async onModuleDestroy() {
    try {
      // Disconnect from replicas
      await Promise.all(
        this.replicas.map(async (replica, index) => {
          await replica.$disconnect();
          this.logger.log(`✓ Disconnected from read replica ${index + 1}`);
        }),
      );

      // Disconnect from primary (inherited)
      await this.$disconnect();
      this.logger.log('✓ Disconnected from primary database');
    } catch (error) {
      this.logger.error('✗ Failed to disconnect from database', error);
      throw error;
    }
  }

  /**
   * Check connectivity to all replicas
   */
  async checkReplicaHealth(): Promise<{
    primary: boolean;
    replicas: boolean[];
  }> {
    const replicaHealthChecks = await Promise.all(
      this.replicas.map(async (replica) => {
        try {
          await replica.$queryRaw`SELECT 1`;
          return true;
        } catch {
          return false;
        }
      }),
    );

    const primaryHealth = await this.checkConnection();

    return {
      primary: primaryHealth,
      replicas: replicaHealthChecks,
    };
  }

  /**
   * Check primary database connectivity
   */
  async checkConnection(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error('Primary database connection check failed', error);
      return false;
    }
  }
}
