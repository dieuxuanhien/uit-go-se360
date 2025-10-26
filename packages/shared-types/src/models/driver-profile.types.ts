import { DriverApprovalStatus } from '../enums';
import { UserDTO } from './user.types';

/**
 * Driver Profile Model Interface
 * Represents a driver's profile with vehicle information
 */
export interface DriverProfile {
  id: string;
  userId: string;
  vehicleMake: string;
  vehicleModel: string;
  vehicleYear: number;
  vehiclePlate: string;
  vehicleColor: string;
  licenseNumber: string;
  approvalStatus: DriverApprovalStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Driver Profile DTO Interface
 * Driver profile data returned in API responses (includes optional user details)
 */
export interface DriverProfileDTO extends DriverProfile {
  user?: UserDTO;
}
