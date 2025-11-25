import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { PrismaReplicaService } from '../database/database-replica.service';
import { CacheService } from '../cache/cache.service';
import { User, Prisma } from '@prisma/client';

/**
 * Users Repository
 * Handles all database operations for User entity
 * Story 2.3: Implements cache-aside pattern with Redis Cluster
 */
@Injectable()
export class UsersRepository {
  private readonly userTTL: number;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly replicaService: PrismaReplicaService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {
    this.userTTL = this.configService.get<number>('cache.ttl.user', 3600);
  }

  /**
   * Find user by ID
   * Story 2.3: Cache-aside pattern
   * 1. Check cache first
   * 2. If miss, fetch from DB replica
   * 3. Store in cache for next request
   */
  async findById(userId: string): Promise<User | null> {
    const cacheKey = `user:${userId}`;

    // Step 1: Try cache first
    const cached = await this.cacheService.get<User>(cacheKey);
    if (cached) {
      return cached;
    }

    // Step 2: Cache miss - fetch from read replica
    const readClient = this.replicaService.getReadClient();
    const user = await readClient.user.findUnique({
      where: { id: userId },
    });

    // Step 3: Store in cache if found
    if (user) {
      await this.cacheService.set(cacheKey, user, this.userTTL);
    }

    return user;
  }

  /**
   * Find user by email
   * @param email User email
   * @returns User or null if not found
   * Story 2.3: Cache-aside pattern with email-based key
   */
  async findByEmail(email: string): Promise<User | null> {
    const cacheKey = `user:email:${email}`;

    // Try cache first
    const cached = await this.cacheService.get<User>(cacheKey);
    if (cached) {
      return cached;
    }

    // Cache miss - fetch from read replica
    const readClient = this.replicaService.getReadClient();
    const user = await readClient.user.findUnique({
      where: { email },
    });

    // Store in cache if found
    if (user) {
      await this.cacheService.set(cacheKey, user, this.userTTL);
      // Also cache by ID for consistency
      await this.cacheService.set(`user:${user.id}`, user, this.userTTL);
    }

    return user;
  }

  /**
   * Create a new user
   * @param data User creation data
   * @returns Created user
   * Story 2.3: Write-through cache - store immediately after creation
   */
  async create(data: Prisma.UserCreateInput): Promise<User> {
    const user = await this.prisma.user.create({
      data,
    });

    // Write-through: Cache the newly created user
    await this.cacheService.set(`user:${user.id}`, user, this.userTTL);
    await this.cacheService.set(`user:email:${user.email}`, user, this.userTTL);

    return user;
  }

  /**
   * Update user by ID
   * @param userId User ID
   * @param data Update data
   * @returns Updated user
   * Story 2.3: Write-through invalidation - remove stale cache after update
   */
  async update(userId: string, data: Prisma.UserUpdateInput): Promise<User> {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data,
    });

    // Invalidate cache - will be refreshed on next read
    await this.cacheService.delete(`user:${userId}`);
    await this.cacheService.delete(`user:email:${user.email}`);

    return user;
  }

  /**
   * Delete user by ID
   * @param userId User ID
   * @returns Deleted user
   * Story 2.3: Write-through invalidation - remove from cache after deletion
   */
  async delete(userId: string): Promise<User> {
    const user = await this.prisma.user.delete({
      where: { id: userId },
    });

    // Invalidate cache
    await this.cacheService.delete(`user:${userId}`);
    await this.cacheService.delete(`user:email:${user.email}`);

    return user;
  }
}
