import { UserRole } from '../enums';

/**
 * User Model Interface
 * Represents a user in the system (passenger or driver)
 */
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * User DTO Interface
 * User data returned in API responses (excludes passwordHash)
 */
export interface UserDTO {
  id: string;
  email: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Auth Response Interface
 * Response from login/register endpoints
 */
export interface AuthResponse {
  user: UserDTO;
  accessToken: string;
}
