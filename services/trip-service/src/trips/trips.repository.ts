import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Trip, TripStatus, Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

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

  constructor(private readonly prisma: PrismaService) {}

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

  async findById(id: string): Promise<Trip | null> {
    try {
      return await this.prisma.trip.findUnique({
        where: { id },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch trip');
    }
  }

  async findByIdWithUsers(id: string): Promise<Prisma.TripGetPayload<{
    include: { passenger: true; driver: true };
  }> | null> {
    try {
      return await this.prisma.trip.findUnique({
        where: { id },
        include: {
          passenger: true,
          driver: true,
        },
      });
    } catch (error) {
      throw new InternalServerErrorException('Failed to fetch trip');
    }
  }

  async findByPassengerId(passengerId: string): Promise<Trip[]> {
    try {
      return await this.prisma.trip.findMany({
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
    timestamps?: Partial<{ startedAt: Date; arrivedAt: Date }>,
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
      return await this.prisma.trip.update({
        where: { id: tripId },
        data: updateData,
      });
    } catch (error) {
      this.logger.error('Failed to update trip status', error);
      throw new InternalServerErrorException('Failed to update trip status');
    }
  }
}
