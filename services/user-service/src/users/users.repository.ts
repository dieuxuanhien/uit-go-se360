import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { User, Prisma } from '@prisma/client';

/**
 * Users Repository
 * Handles all database operations for User entity
 */
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: DatabaseService) {}

  /**
   * Find user by ID
   * @param userId User ID
   * @returns User or null if not found
   */
  async findById(userId: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { id: userId },
    });
  }

  /**
   * Find user by email
   * @param email User email
   * @returns User or null if not found
   */
  async findByEmail(email: string): Promise<User | null> {
    return await this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Create a new user
   * @param data User creation data
   * @returns Created user
   */
  async create(data: Prisma.UserCreateInput): Promise<User> {
    return await this.prisma.user.create({
      data,
    });
  }

  /**
   * Update user by ID
   * @param userId User ID
   * @param data Update data
   * @returns Updated user
   */
  async update(userId: string, data: Prisma.UserUpdateInput): Promise<User> {
    return await this.prisma.user.update({
      where: { id: userId },
      data,
    });
  }

  /**
   * Delete user by ID
   * @param userId User ID
   * @returns Deleted user
   */
  async delete(userId: string): Promise<User> {
    return await this.prisma.user.delete({
      where: { id: userId },
    });
  }
}
