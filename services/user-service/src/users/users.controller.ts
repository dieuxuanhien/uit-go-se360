import { Controller, Get, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser as CurrentUserDecorator } from '../common/decorators/current-user.decorator';

/**
 * Users Controller
 * Provides protected endpoints for user data operations
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * Get Current User Profile Endpoint
   * Returns the authenticated user's profile information
   *
   * @param user Current authenticated user from JWT token
   * @returns User profile data
   *
   * @example
   * GET /users/me
   * Headers: {
   *   "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   * }
   *
   * Response (200):
   * {
   *   "id": "uuid",
   *   "email": "user@example.com",
   *   "role": "PASSENGER",
   *   "firstName": "John",
   *   "lastName": "Doe",
   *   "phoneNumber": "+84123456789",
   *   "createdAt": "2025-10-26T10:30:00Z",
   *   "updatedAt": "2025-10-26T10:30:00Z"
   * }
   *
   * Response (401): Unauthorized - Invalid or missing JWT token
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getCurrentUser(@CurrentUserDecorator() user: any) {
    return this.usersService.getUserById(user.userId);
  }
}
