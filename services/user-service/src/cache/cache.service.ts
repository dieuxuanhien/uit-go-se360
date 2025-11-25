/**
 * Distributed Cache Service (Redis Cluster)
 * Story 2.3: Distributed Caching
 * 
 * Provides cache-aside pattern with write-through invalidation
 * Target: 90% cache hit rate, p95 <5ms latency
 */

import { Cluster, ClusterNode, ClusterOptions, RedisOptions } from 'ioredis';

export interface CacheConfig {
  nodes: ClusterNode[];
  options?: ClusterOptions;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  hitRate: number;
  totalOperations: number;
}

/**
 * Redis Cluster Cache Service
 * 
 * Features:
 * - Automatic sharding across cluster nodes
 * - Failover to replica nodes
 * - TTL-based expiration
 * - JSON serialization/deserialization
 * - Cache hit rate tracking
 */
export class CacheService {
  private client: Cluster;
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    hitRate: 0,
    totalOperations: 0,
  };

  constructor(config: CacheConfig) {
    this.client = new Cluster(config.nodes, {
      redisOptions: {
        password: config.options?.redisOptions?.password,
        connectTimeout: 10000,
        commandTimeout: 5000,
      },
      clusterRetryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      enableReadyCheck: true,
      ...config.options,
    });

    this.client.on('error', (err) => {
      console.error('[CacheService] Redis Cluster error:', err);
    });

    this.client.on('ready', () => {
      console.log('[CacheService] ✅ Redis Cluster ready');
    });
  }

  /**
   * Get value from cache
   * Returns null if key doesn't exist (cache miss)
   */
  async get<T = any>(key: string): Promise<T | null> {
    try {
      const value = await this.client.get(key);
      
      if (value === null) {
        this.recordMiss();
        return null;
      }

      this.recordHit();
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`[CacheService] Error getting key "${key}":`, error);
      this.recordMiss();
      return null;
    }
  }

  /**
   * Set value in cache with TTL (seconds)
   * Default TTL: 1 hour (3600s)
   */
  async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      await this.client.setex(key, ttl, serialized);
    } catch (error) {
      console.error(`[CacheService] Error setting key "${key}":`, error);
      // Don't throw - cache failures should not break application
    }
  }

  /**
   * Delete key from cache (invalidation)
   */
  async delete(key: string): Promise<void> {
    try {
      await this.client.del(key);
    } catch (error) {
      console.error(`[CacheService] Error deleting key "${key}":`, error);
    }
  }

  /**
   * Delete multiple keys matching pattern
   * WARNING: Use with caution in production (SCAN is expensive)
   */
  async deletePattern(pattern: string): Promise<number> {
    try {
      const keys: string[] = [];
      
      // For Redis Cluster, we need to scan each master node
      const nodes = this.client.nodes('master');
      
      for (const node of nodes) {
        const stream = node.scanStream({
          match: pattern,
          count: 100,
        });

        await new Promise<void>((resolve, reject) => {
          stream.on('data', (resultKeys: string[]) => {
            keys.push(...resultKeys);
          });

          stream.on('end', () => {
            resolve();
          });

          stream.on('error', (err: Error) => {
            reject(err);
          });
        });
      }
      
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
      
      return keys.length;
    } catch (error) {
      console.error(`[CacheService] Error deleting pattern "${pattern}":`, error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`[CacheService] Error checking key "${key}":`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL (seconds)
   * Returns -1 if key has no TTL
   * Returns -2 if key doesn't exist
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.client.ttl(key);
    } catch (error) {
      console.error(`[CacheService] Error getting TTL for key "${key}":`, error);
      return -2;
    }
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    return {
      ...this.metrics,
      hitRate: this.metrics.totalOperations > 0
        ? this.metrics.hits / this.metrics.totalOperations
        : 0,
    };
  }

  /**
   * Reset metrics (useful for testing)
   */
  resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      hitRate: 0,
      totalOperations: 0,
    };
  }

  /**
   * Close connection to Redis Cluster
   */
  async disconnect(): Promise<void> {
    await this.client.quit();
  }

  /**
   * Ping Redis Cluster (health check)
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      return false;
    }
  }

  private recordHit(): void {
    this.metrics.hits++;
    this.metrics.totalOperations++;
  }

  private recordMiss(): void {
    this.metrics.misses++;
    this.metrics.totalOperations++;
  }
}

/**
 * Cache key builder utility
 * Follows naming convention: {service}:{entity}:{id}:{version}
 */
export class CacheKeyBuilder {
  static userProfile(userId: string): string {
    return `user:profile:${userId}:v1`;
  }

  static driverProfile(userId: string): string {
    return `user:driver:${userId}:v1`;
  }

  static driverRating(driverId: string): string {
    return `user:rating:${driverId}:v1`;
  }

  static activeTrip(userId: string): string {
    return `trip:active:${userId}:v1`;
  }

  static tripHistory(userId: string, page: number): string {
    return `trip:history:${userId}:page:${page}:v1`;
  }

  static tripDetails(tripId: string): string {
    return `trip:details:${tripId}:v1`;
  }

  static allUserKeys(userId: string): string {
    return `user:*:${userId}:*`;
  }

  static allTripKeys(tripId: string): string {
    return `trip:*:${tripId}:*`;
  }
}

/**
 * Cache TTL constants (seconds)
 */
export const CacheTTL = {
  USER_PROFILE: 3600,      // 1 hour - rarely changes
  DRIVER_PROFILE: 1800,    // 30 minutes - approval status changes
  DRIVER_RATING: 600,      // 10 minutes - aggregated frequently
  ACTIVE_TRIP: 60,         // 1 minute - real-time data
  TRIP_HISTORY: 1800,      // 30 minutes - historical data
  TRIP_DETAILS: 3600,      // 1 hour - immutable after completion
} as const;
