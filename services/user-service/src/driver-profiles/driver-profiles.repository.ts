import { Injectable, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseService } from '../database/database.service';
import { PrismaReplicaService } from '../database/database-replica.service';
import { CacheService } from '../cache/cache.service';
import { DriverProfile, Prisma } from '@prisma/client';

/**
 * Driver Profiles Repository
 * Story 2.3: Implements cache-aside pattern for driver profile queries
 */
@Injectable()
export class DriverProfilesRepository {
  private readonly driverProfileTTL: number;

  constructor(
    private readonly prisma: DatabaseService,
    private readonly replicaService: PrismaReplicaService,
    private readonly cacheService: CacheService,
    private readonly configService: ConfigService,
  ) {
    this.driverProfileTTL = this.configService.get<number>('cache.ttl.driverProfile', 1800);
  }

  async create(data: Prisma.DriverProfileCreateInput): Promise<DriverProfile> {
    try {
      const profile = await this.prisma.driverProfile.create({
        data,
        include: {
          user: true,
        },
      });

      // Story 2.3: Write-through - cache newly created profile (if cache available)
      if (this.cacheService) {
        await this.cacheService.set(`driver:user:${profile.userId}`, profile, this.driverProfileTTL);
        await this.cacheService.set(`driver:plate:${profile.vehiclePlate}`, profile, this.driverProfileTTL);
        await this.cacheService.set(`driver:license:${profile.licenseNumber}`, profile, this.driverProfileTTL);
      }

      return profile;
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
    const cacheKey = `driver:user:${userId}`;

    // Story 2.3: Cache-aside pattern (if cache available)
    if (this.cacheService) {
      const cached = await this.cacheService.get<DriverProfile>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Cache miss (or no cache) - fetch from read replica
    const readClient = this.replicaService.getReadClient();
    const profile = await readClient.driverProfile.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });

    // Store in cache if found (if cache available)
    if (profile && this.cacheService) {
      await this.cacheService.set(cacheKey, profile, this.driverProfileTTL);
    }

    return profile;
  }

  async findByVehiclePlate(
    vehiclePlate: string,
  ): Promise<DriverProfile | null> {
    const cacheKey = `driver:plate:${vehiclePlate}`;

    // Cache-aside pattern (if cache available)
    if (this.cacheService) {
      const cached = await this.cacheService.get<DriverProfile>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Cache miss (or no cache) - fetch from read replica
    const readClient = this.replicaService.getReadClient();
    const profile = await readClient.driverProfile.findUnique({
      where: { vehiclePlate },
    });

    // Store in cache if found (if cache available)
    if (profile && this.cacheService) {
      await this.cacheService.set(cacheKey, profile, this.driverProfileTTL);
    }

    return profile;
  }

  async findByLicenseNumber(
    licenseNumber: string,
  ): Promise<DriverProfile | null> {
    const cacheKey = `driver:license:${licenseNumber}`;

    // Cache-aside pattern (if cache available)
    if (this.cacheService) {
      const cached = await this.cacheService.get<DriverProfile>(cacheKey);
      if (cached) {
        return cached;
      }
    }

    // Cache miss (or no cache) - fetch from read replica
    const readClient = this.replicaService.getReadClient();
    const profile = await readClient.driverProfile.findUnique({
      where: { licenseNumber },
    });

    // Store in cache if found (if cache available)
    if (profile && this.cacheService) {
      await this.cacheService.set(cacheKey, profile, this.driverProfileTTL);
    }

    return profile;
  }
}
