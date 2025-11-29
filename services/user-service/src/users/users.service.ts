import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';

/**
 * Result type for cache-aware user queries
 */
export interface UserWithCacheInfo {
  user: Record<string, unknown>;
  cacheHit: boolean;
}

/**
 * Users Service
 * Handles user business logic and operations
 */
@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  /**
   * Get user by ID (simple version for backward compatibility)
   * @param userId User ID
   * @returns User data excluding password
   * @throws NotFoundException if user not found
   */
  async getUserById(userId: string) {
    const result = await this.getUserByIdWithCacheInfo(userId);
    return result.user;
  }

  /**
   * Get user by ID with cache hit information
   * @param userId User ID
   * @returns User data and cache hit status
   * @throws NotFoundException if user not found
   */
  async getUserByIdWithCacheInfo(userId: string): Promise<UserWithCacheInfo> {
    const result = await this.repository.findByIdWithCacheInfo(userId);

    if (!result.data) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash: _passwordHash, ...userWithoutPassword } = result.data;
    return {
      user: userWithoutPassword,
      cacheHit: result.cacheHit,
    };
  }

  /**
   * Get user by email
   * @param email User email
   * @returns User data excluding password
   */
  async getUserByEmail(email: string) {
    const user = await this.repository.findByEmail(email);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash: _passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
