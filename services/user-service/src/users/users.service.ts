import { Injectable, NotFoundException } from '@nestjs/common';
import { UsersRepository } from './users.repository';

/**
 * Users Service
 * Handles user business logic and operations
 */
@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  /**
   * Get user by ID
   * @param userId User ID
   * @returns User data excluding password
   * @throws NotFoundException if user not found
   */
  async getUserById(userId: string) {
    const user = await this.repository.findById(userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const { passwordHash: _passwordHash, ...userWithoutPassword } = user;
    return userWithoutPassword;
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
