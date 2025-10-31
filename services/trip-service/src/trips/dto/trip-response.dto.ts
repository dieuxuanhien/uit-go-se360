import { ApiProperty } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';

export class TripResponseDto {
  @ApiProperty({
    description: 'Unique trip identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Passenger user ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  passengerId: string;

  @ApiProperty({
    description: 'Driver user ID (null if not assigned)',
    example: null,
    nullable: true,
  })
  driverId: string | null;

  @ApiProperty({
    description: 'Current trip status',
    enum: TripStatus,
    example: TripStatus.REQUESTED,
  })
  status: TripStatus;

  @ApiProperty({
    description: 'Pickup latitude',
    example: 10.762622,
  })
  pickupLatitude: number;

  @ApiProperty({
    description: 'Pickup longitude',
    example: 106.660172,
  })
  pickupLongitude: number;

  @ApiProperty({
    description: 'Pickup address',
    example: 'District 1, Ho Chi Minh City',
  })
  pickupAddress: string;

  @ApiProperty({
    description: 'Destination latitude',
    example: 10.823099,
  })
  destinationLatitude: number;

  @ApiProperty({
    description: 'Destination longitude',
    example: 106.629662,
  })
  destinationLongitude: number;

  @ApiProperty({
    description: 'Destination address',
    example: 'Tan Binh District, Ho Chi Minh City',
  })
  destinationAddress: string;

  @ApiProperty({
    description: 'Estimated fare in cents',
    example: 1450,
  })
  estimatedFare: number;

  @ApiProperty({
    description: 'Actual fare in cents (null until completed)',
    example: null,
    nullable: true,
  })
  actualFare: number | null;

  @ApiProperty({
    description: 'Estimated distance in kilometers',
    example: 8.5,
  })
  estimatedDistance: number;

  @ApiProperty({
    description: 'Trip requested timestamp',
    example: '2025-10-31T10:30:00Z',
  })
  requestedAt: Date;

  @ApiProperty({
    description: 'Driver assigned timestamp',
    example: null,
    nullable: true,
  })
  driverAssignedAt: Date | null;

  @ApiProperty({
    description: 'Trip started timestamp',
    example: null,
    nullable: true,
  })
  startedAt: Date | null;

  @ApiProperty({
    description: 'Trip completed timestamp',
    example: null,
    nullable: true,
  })
  completedAt: Date | null;

  @ApiProperty({
    description: 'Trip cancelled timestamp',
    example: null,
    nullable: true,
  })
  cancelledAt: Date | null;

  @ApiProperty({
    description: 'Cancellation reason',
    example: null,
    nullable: true,
  })
  cancellationReason: string | null;

  @ApiProperty({
    description: 'Record created timestamp',
    example: '2025-10-31T10:30:00Z',
  })
  createdAt: Date;

  @ApiProperty({
    description: 'Record last updated timestamp',
    example: '2025-10-31T10:30:00Z',
  })
  updatedAt: Date;
}
