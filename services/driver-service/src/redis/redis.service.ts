import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService extends Redis implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(private configService: ConfigService) {
    const redisConfig = {
      host: configService.get<string>('redis.host'),
      port: configService.get<number>('redis.port'),
      password: configService.get<string>('redis.password'),
      db: configService.get<number>('redis.db'),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    };

    super(redisConfig);
  }

  async onModuleInit() {
    this.on('connect', () => {
      this.logger.log('Redis connected successfully');
    });

    this.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });

    this.on('ready', () => {
      this.logger.log('Redis is ready to accept commands');
    });

    this.on('close', () => {
      this.logger.warn('Redis connection closed');
    });

    // Test connection
    try {
      await this.ping();
      this.logger.log('Redis health check passed');
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      // Only quit if connection is not already closed/ending. ioredis exposes a
      // `status` property which will be 'end' when connection is closed. Calling
      // quit more than once can lead to "Connection is closed" errors during
      // test teardown when consumers also call quit(). Make this idempotent.
      if ((this as Redis).status !== 'end') {
        await this.quit();
        this.logger.log('Redis connection closed gracefully');
      } else {
        this.logger.log('Redis connection already closed, skipping quit');
      }
    } catch (error) {
      // Log but don't rethrow during shutdown to avoid crashing the process
      this.logger.warn('Error while closing Redis connection', (error as Error).message);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return false;
    }
  }
}
