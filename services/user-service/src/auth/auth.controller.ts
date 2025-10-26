import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  RegisterRequestDto,
  LoginRequestDto,
  AuthResponseDto,
} from './dto/auth.dto';

/**
 * Authentication Controller
 * Handles user registration and login endpoints
 */
@Controller('users')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * User Registration Endpoint
   * Creates a new user account and returns JWT token
   *
   * @param dto Registration request with user details
   * @returns User data and JWT access token
   *
   * @example
   * POST /users/register
   * Body: {
   *   "email": "user@example.com",
   *   "password": "password123",
   *   "role": "PASSENGER",
   *   "firstName": "John",
   *   "lastName": "Doe",
   *   "phoneNumber": "+84123456789"
   * }
   *
   * Response (201):
   * {
   *   "user": {
   *     "id": "uuid",
   *     "email": "user@example.com",
   *     "role": "PASSENGER",
   *     "firstName": "John",
   *     "lastName": "Doe",
   *     "phoneNumber": "+84123456789",
   *     "createdAt": "2025-10-26T10:30:00Z",
   *     "updatedAt": "2025-10-26T10:30:00Z"
   *   },
   *   "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   * }
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterRequestDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  /**
   * User Login Endpoint
   * Authenticates user and returns JWT token
   *
   * @param dto Login request with email and password
   * @returns User data and JWT access token
   *
   * @example
   * POST /users/login
   * Body: {
   *   "email": "user@example.com",
   *   "password": "password123"
   * }
   *
   * Response (200):
   * {
   *   "user": {
   *     "id": "uuid",
   *     "email": "user@example.com",
   *     "role": "PASSENGER",
   *     ...
   *   },
   *   "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
   * }
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginRequestDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }
}
