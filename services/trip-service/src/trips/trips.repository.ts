import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { Trip, TripStatus, Prisma } from '@prisma/client';
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
}
