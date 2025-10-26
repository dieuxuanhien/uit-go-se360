import {
  Injectable,
  ForbiddenException,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { DriverProfile, User } from '@prisma/client';
import { DriverProfilesRepository } from './driver-profiles.repository';
import { CreateDriverProfileDto } from './dto/create-driver-profile.dto';
import {
  DriverProfileDTO,
  DriverApprovalStatus,
  UserRole,
} from '@uit-go/shared-types';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class DriverProfilesService {
  private readonly logger = new Logger(DriverProfilesService.name);

  constructor(
    private readonly repository: DriverProfilesRepository,
    private readonly prisma: DatabaseService,
  ) {}

  async createProfile(
    userId: string,
    dto: CreateDriverProfileDto,
  ): Promise<DriverProfileDTO> {
    // Verify user exists and has DRIVER role
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== 'DRIVER') {
      throw new ForbiddenException(
        'Only users with DRIVER role can create driver profiles',
      );
    }

    // Check if profile already exists
    const existingProfile = await this.repository.findByUserId(userId);
    if (existingProfile) {
      throw new ConflictException(
        'Driver profile already exists for this user',
      );
    }

    // Check vehicle plate uniqueness
    const existingPlate = await this.repository.findByVehiclePlate(
      dto.vehiclePlate,
    );
    if (existingPlate) {
      throw new ConflictException('Vehicle plate already exists');
    }

    // Check license number uniqueness
    const existingLicense = await this.repository.findByLicenseNumber(
      dto.licenseNumber,
    );
    if (existingLicense) {
      throw new ConflictException('License number already exists');
    }

    // Create profile with PENDING status
    const profile = await this.repository.create({
      user: {
        connect: { id: userId },
      },
      vehicleMake: dto.vehicleMake,
      vehicleModel: dto.vehicleModel,
      vehicleYear: dto.vehicleYear,
      vehiclePlate: dto.vehiclePlate,
      vehicleColor: dto.vehicleColor,
      licenseNumber: dto.licenseNumber,
      approvalStatus: 'PENDING',
    });

    this.logger.log(`Driver profile created for user ${userId}`, {
      profileId: profile.id,
      vehiclePlate: dto.vehiclePlate,
    });

    return this.mapToDto(profile);
  }

  async getProfile(userId: string): Promise<DriverProfileDTO> {
    const profile = await this.repository.findByUserId(userId);

    if (!profile) {
      throw new NotFoundException('Driver profile not found');
    }

    return this.mapToDto(profile);
  }

  private mapToDto(profile: DriverProfile & { user?: User }): DriverProfileDTO {
    return {
      id: profile.id,
      userId: profile.userId,
      vehicleMake: profile.vehicleMake,
      vehicleModel: profile.vehicleModel,
      vehicleYear: profile.vehicleYear,
      vehiclePlate: profile.vehiclePlate,
      vehicleColor: profile.vehicleColor,
      licenseNumber: profile.licenseNumber,
      approvalStatus: profile.approvalStatus as DriverApprovalStatus,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      user: profile.user
        ? {
            id: profile.user.id,
            email: profile.user.email,
            role: profile.user.role as UserRole,
            firstName: profile.user.firstName,
            lastName: profile.user.lastName,
            phoneNumber: profile.user.phoneNumber,
            createdAt: profile.user.createdAt,
            updatedAt: profile.user.updatedAt,
          }
        : undefined,
    };
  }
}
