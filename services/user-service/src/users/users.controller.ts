import { Controller, Get, UseGuards, Res } from '@nestjs/common';
import { Response } from 'express';
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
   * Story 2.3: Adds X-Cache-Hit header for cache observability
   *
   * @param user Current authenticated user from JWT token
   * @param res Express response object for setting headers
   * @returns User profile data
   *
   * @example
   * GET /users/me
   * Headers: {
   *   "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   * }
   *
   * Response (200):
   * Headers: {
   *   "X-Cache-Hit": "true" | "false"
   * }
   * Body: {
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
  async getCurrentUser(@CurrentUserDecorator() user: any, @Res() res: Response) {
    const result = await this.usersService.getUserByIdWithCacheInfo(user.userId);
    
    // Set cache hit header for load test observability
    res.setHeader('X-Cache-Hit', result.cacheHit ? 'true' : 'false');
    
    return res.json(result.user);
  }
}
