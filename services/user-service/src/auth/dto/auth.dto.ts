import { IsEmail, IsEnum, MinLength, IsString, Matches } from 'class-validator';

/**
 * User Role Enum
 */
export enum UserRoleEnum {
  PASSENGER = 'PASSENGER',
  DRIVER = 'DRIVER',
}

/**
 * Register Request DTO
 * Validates user registration input
 */
export class RegisterRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password!: string;

  @IsEnum(UserRoleEnum)
  role!: UserRoleEnum;

  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  firstName!: string;

  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  lastName!: string;

  @Matches(/^[\d\s\-+()]+$/, {
    message: 'Phone number must be a valid phone format',
  })
  phoneNumber!: string;
}

/**
 * Login Request DTO
 * Validates user login input
 */
export class LoginRequestDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;
}

/**
 * User Response DTO
 * User data returned in API responses (excludes password)
 */
export class UserResponseDto {
  id!: string;
  email!: string;
  role!: string;
  firstName!: string;
  lastName!: string;
  phoneNumber!: string;
  createdAt!: Date;
  updatedAt!: Date;
}

/**
 * Auth Response DTO
 * Response from login/register endpoints
 */
export class AuthResponseDto {
  user!: UserResponseDto;
  accessToken!: string;
}
