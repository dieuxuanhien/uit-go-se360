import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { Cluster } from 'ioredis';

// Type alias for the Redis client (can be standalone or cluster)
type RedisClient = Redis | Cluster;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClient;
  private isClusterMode: boolean;

  constructor(private configService: ConfigService) {
    this.isClusterMode = this.configService.get<boolean>('redis.clusterMode') || false;

    if (this.isClusterMode) {
      // Redis Cluster mode
      const nodes = this.configService.get<Array<{ host: string; port: number }>>('redis.nodes') || [];
      const password = this.configService.get<string>('redis.password');
      
      this.logger.log(`Initializing Redis Cluster with ${nodes.length} nodes`);
      
      this.client = new Cluster(nodes, {
        scaleReads: 'slave', // Read from replicas
        redisOptions: {
          password: password || undefined,
        },
        clusterRetryStrategy: (times: number) => {
          const delay = Math.min(times * 100, 3000);
          return delay;
        },
        // Enable read from replicas for better scalability
        enableReadyCheck: true,
        maxRedirections: 16,
      });
    } else {
      // Standalone Redis mode
      const redisConfig = {
        host: this.configService.get<string>('redis.host'),
        port: this.configService.get<number>('redis.port'),
        password: this.configService.get<string>('redis.password'),
        db: this.configService.get<number>('redis.db'),
        retryStrategy: (times: number) => {
          const delay = Math.min(times * 50, 2000);
          return delay;
        },
      };

      this.logger.log(`Initializing standalone Redis at ${redisConfig.host}:${redisConfig.port}`);
      this.client = new Redis(redisConfig);
    }
  }

  // Expose the underlying client for direct access
  getClient(): RedisClient {
    return this.client;
  }

  // Proxy common Redis commands to the client
  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ...args: any[]): Promise<string> {
    return this.client.set(key, value, ...args);
  }

  async del(...keys: string[]): Promise<number> {
    return this.client.del(...keys);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.client.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<number> {
    return this.client.hset(key, field, value);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.client.hgetall(key);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.client.sadd(key, ...members);
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    return this.client.srem(key, ...members);
  }

  async smembers(key: string): Promise<string[]> {
    return this.client.smembers(key);
  }

  async sismember(key: string, member: string): Promise<number> {
    return this.client.sismember(key, member);
  }

  async expire(key: string, seconds: number): Promise<number> {
    return this.client.expire(key, seconds);
  }

  async ping(): Promise<string> {
    return this.client.ping();
  }

  // Geospatial commands
  async geoadd(key: string, longitude: number, latitude: number, member: string): Promise<number> {
    return this.client.geoadd(key, longitude, latitude, member);
  }

  async geopos(key: string, ...members: string[]): Promise<Array<[string, string] | null>> {
    return this.client.geopos(key, ...members);
  }

  async georadius(
    key: string,
    longitude: number,
    latitude: number,
    radius: number,
    unit: 'km' | 'm' | 'mi' | 'ft',
    ...options: string[]
  ): Promise<string[]> {
    return this.client.georadius(key, longitude, latitude, radius, unit, ...options) as Promise<string[]>;
  }

  async zrem(key: string, ...members: string[]): Promise<number> {
    return this.client.zrem(key, ...members);
  }

  async onModuleInit() {
    this.client.on('connect', () => {
      this.logger.log(`Redis ${this.isClusterMode ? 'Cluster' : 'standalone'} connected successfully`);
    });

    this.client.on('error', (error) => {
      this.logger.error('Redis connection error', error);
    });

    this.client.on('ready', () => {
      this.logger.log(`Redis ${this.isClusterMode ? 'Cluster' : 'standalone'} is ready to accept commands`);
    });

    this.client.on('close', () => {
      this.logger.warn('Redis connection closed');
    });

    if (this.isClusterMode) {
      (this.client as Cluster).on('node error', (error, address) => {
        this.logger.warn(`Redis Cluster node error at ${address}`, error.message);
      });
    }

    // Test connection
    try {
      await this.client.ping();
      this.logger.log(`Redis ${this.isClusterMode ? 'Cluster' : 'standalone'} health check passed`);
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      const status = (this.client as Redis).status;
      if (status !== 'end') {
        await this.client.quit();
        this.logger.log('Redis connection closed gracefully');
      } else {
        this.logger.log('Redis connection already closed, skipping quit');
      }
    } catch (error) {
      this.logger.warn('Error while closing Redis connection', (error as Error).message);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis health check failed', error);
      return false;
    }
  }
}
