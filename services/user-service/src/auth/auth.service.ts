import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '../users/users.repository';
import {
  RegisterRequestDto,
  LoginRequestDto,
  AuthResponseDto,
} from './dto/auth.dto';

/**
 * Auth Service
 * Handles user authentication: registration, login, JWT token generation
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly repository: UsersRepository,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Register a new user
   * @param dto Registration request with user details
   * @returns User data and JWT access token
   * @throws BadRequestException if validation fails
   * @throws ConflictException if email already exists
   */
  async register(dto: RegisterRequestDto): Promise<AuthResponseDto> {
    // Check if user already exists
    const existingUser = await this.repository.findByEmail(dto.email);

    if (existingUser) {
      this.logger.warn(
        `Registration attempted with existing email: ${dto.email}`,
      );
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(dto.password, this.SALT_ROUNDS);

    // Create user
    const user = await this.repository.create({
      email: dto.email,
      passwordHash: hashedPassword,
      role: dto.role,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phoneNumber: dto.phoneNumber,
    });

    this.logger.log(`User registered: ${user.email}`);

    // Generate JWT token
    const accessToken = this.generateToken(user.id, user.email, user.role);

    return {
      user: this.userToResponse(user),
      accessToken,
    };
  }

  /**
   * Login user
   * @param dto Login request with email and password
   * @returns User data and JWT access token
   * @throws UnauthorizedException if credentials are invalid
   */
  async login(dto: LoginRequestDto): Promise<AuthResponseDto> {
    // Find user by email
    const user = await this.repository.findByEmail(dto.email);

    if (!user) {
      this.logger.warn(`Login attempt with non-existent email: ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Compare passwords
    const passwordMatch = await bcrypt.compare(dto.password, user.passwordHash);

    if (!passwordMatch) {
      this.logger.warn(`Failed login attempt for: ${dto.email}`);
      throw new UnauthorizedException('Invalid credentials');
    }

    this.logger.log(`User logged in: ${user.email}`);

    // Generate JWT token
    const accessToken = this.generateToken(user.id, user.email, user.role);

    return {
      user: this.userToResponse(user),
      accessToken,
    };
  }

  /**
   * Validate user by ID (used by JWT strategy)
   * @param userId User ID from JWT token
   * @returns User data or null if not found
   */
  async validateUser(userId: string) {
    return this.repository.findById(userId);
  }

  /**
   * Generate JWT token
   * @param userId User ID
   * @param email User email
   * @param role User role
   * @returns JWT token
   */
  private generateToken(userId: string, email: string, role: string): string {
    const payload = {
      sub: userId,
      email,
      role,
    };

    return this.jwtService.sign(payload);
  }

  /**
   * Convert user object to response DTO (excludes password)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private userToResponse(user: any) {
    const { passwordHash: _passwordHash, ...response } = user;
    return response;
  }
}
