import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Trip, TripStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PrismaReplicaService } from '../prisma/prisma-replica.service';

export interface CreateTripData {
  passengerId: string;
  pickupLatitude: number;
  pickupLongitude: number;
  pickupAddress: string;
  destinationLatitude: number;
  destinationLongitude: number;
  destinationAddress: string;
  estimatedFare: number;
  estimatedDistance: number;
  status: TripStatus;
}

@Injectable()
export class TripsRepository {
  private readonly logger = new Logger(TripsRepository.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly replicaService: PrismaReplicaService,
  ) {}

  async create(data: CreateTripData): Promise<Trip> {
    try {
      return await this.prisma.trip.create({
        data: {
          id: undefined, // Let Prisma generate UUID
          passengerId: data.passengerId,
          pickupLatitude: new Prisma.Decimal(data.pickupLatitude),
          pickupLongitude: new Prisma.Decimal(data.pickupLongitude),
          pickupAddress: data.pickupAddress,
          destinationLatitude: new Prisma.Decimal(data.destinationLatitude),
          destinationLongitude: new Prisma.Decimal(data.destinationLongitude),
          destinationAddress: data.destinationAddress,
          estimatedFare: data.estimatedFare,
          estimatedDistance: new Prisma.Decimal(data.estimatedDistance),
          status: data.status,
        },
      });
    } catch (error) {
      this.logger.error('Failed to create trip in database', error);
      throw new InternalServerErrorException(
        'Failed to create trip in database',
      );
    }
  }

  /**
   * Find trip by ID - Uses PRIMARY database
   * 
   * Production Pattern: "Read-Your-Writes" consistency
   * - Single trip lookups require real-time data (passenger polling for status)
   * - Replicas can have 1-5s lag which causes 404 for recently created trips
   * - Use replica only for historical/aggregate queries where staleness is OK
   * 
   * @param id - Trip UUID
   * @param options.allowStale - If true, use replica (for non-critical lookups)
   */
  async findById(id: string, options?: { allowStale?: boolean }): Promise<Trip | null> {
    try {
      // Default: Use primary for individual trip lookup (real-time requirement)
      // Optional: Allow stale reads for analytics/reports
      const client = options?.allowStale 
        ? this.replicaService.getReadClient()
        : this.prisma;
      
      return await client.trip.findUnique({
        where: { id },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch trip');
    }
  }

  async findByPassengerId(passengerId: string): Promise<Trip[]> {
    try {
      // Story 2.2: Use read replica for trip history queries (read-heavy)
      const readClient = this.replicaService.getReadClient();
      return await readClient.trip.findMany({
        where: { passengerId },
        orderBy: { createdAt: 'desc' },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch trips');
    }
  }

  async updateStatus(
    tripId: string,
    status: TripStatus,
    timestamps?: Partial<{
      startedAt: Date;
      arrivedAt: Date;
      pickedUpAt: Date;
      completedAt: Date;
    }>,
    additionalData?: Partial<{
      actualFare: number;
    }>,
  ): Promise<Trip> {
    try {
      const updateData: Prisma.TripUpdateInput = {
        status,
      };
      if (timestamps?.startedAt) {
        updateData.startedAt = timestamps.startedAt;
      }
      if (timestamps?.arrivedAt) {
        updateData.arrivedAt = timestamps.arrivedAt;
      }
      if (timestamps?.pickedUpAt) {
        updateData.pickedUpAt = timestamps.pickedUpAt;
      }
      if (timestamps?.completedAt) {
        updateData.completedAt = timestamps.completedAt;
      }
      if (additionalData?.actualFare !== undefined) {
        updateData.actualFare = additionalData.actualFare;
      }
      return await this.prisma.trip.update({
        where: { id: tripId },
        data: updateData,
      });
    } catch (error) {
      this.logger.error('Failed to update trip status', error);
      throw new InternalServerErrorException('Failed to update trip status');
    }
  }

  /**
   * Cancel a trip with reason
   */
  async cancelTrip(
    tripId: string,
    cancellationReason: string,
  ): Promise<Trip> {
    try {
      return await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          status: TripStatus.CANCELLED,
          cancelledAt: new Date(),
          cancellationReason,
        },
      });
    } catch (error) {
      this.logger.error('Failed to cancel trip', error);
      throw new InternalServerErrorException('Failed to cancel trip');
    }
  }
}
