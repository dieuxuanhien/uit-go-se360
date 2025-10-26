import { Injectable, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DriverProfile, Prisma } from '@prisma/client';

@Injectable()
export class DriverProfilesRepository {
  constructor(private readonly prisma: DatabaseService) {}

  async create(data: Prisma.DriverProfileCreateInput): Promise<DriverProfile> {
    try {
      return await this.prisma.driverProfile.create({
        data,
        include: {
          user: true,
        },
      });
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'P2002'
      ) {
        const prismaError = error as {
          code: string;
          meta?: { target?: string[] };
        };
        const field = prismaError.meta?.target?.[0];
        if (field === 'vehicle_plate') {
          throw new ConflictException('Vehicle plate already exists');
        }
        if (field === 'license_number') {
          throw new ConflictException('License number already exists');
        }
        if (field === 'user_id') {
          throw new ConflictException(
            'Driver profile already exists for this user',
          );
        }
      }
      throw error;
    }
  }

  async findByUserId(userId: string): Promise<DriverProfile | null> {
    return await this.prisma.driverProfile.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });
  }

  async findByVehiclePlate(
    vehiclePlate: string,
  ): Promise<DriverProfile | null> {
    return await this.prisma.driverProfile.findUnique({
      where: { vehiclePlate },
    });
  }

  async findByLicenseNumber(
    licenseNumber: string,
  ): Promise<DriverProfile | null> {
    return await this.prisma.driverProfile.findUnique({
      where: { licenseNumber },
    });
  }
}
