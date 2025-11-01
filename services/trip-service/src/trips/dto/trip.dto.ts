import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';
import { UserDto } from './user.dto';

export class TripDto {
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

  @ApiPropertyOptional({
    description: 'Driver user ID (null if not assigned)',
    example: '660e8400-e29b-41d4-a716-446655440001',
    nullable: true,
  })
  driverId: string | null;

  @ApiProperty({
    description: 'Current trip status',
    enum: TripStatus,
    example: TripStatus.DRIVER_ASSIGNED,
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
    example: 2500,
  })
  estimatedFare: number;

  @ApiPropertyOptional({
    description: 'Actual fare in cents (null until completed)',
    example: 2500,
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
    example: '2025-11-01T10:30:00Z',
  })
  requestedAt: Date;

  @ApiPropertyOptional({
    description: 'Driver assigned timestamp',
    example: '2025-11-01T10:31:15Z',
    nullable: true,
  })
  driverAssignedAt: Date | null;

  @ApiPropertyOptional({
    description: 'Trip started timestamp',
    example: null,
    nullable: true,
  })
  startedAt: Date | null;

  @ApiPropertyOptional({
    description: 'Driver arrived at pickup timestamp',
    example: null,
    nullable: true,
  })
  arrivedAt: Date | null;

  @ApiPropertyOptional({
    description: 'Trip completed timestamp',
    example: null,
    nullable: true,
  })
  completedAt: Date | null;

  @ApiPropertyOptional({
    description: 'Trip cancelled timestamp',
    example: null,
    nullable: true,
  })
  cancelledAt: Date | null;

  @ApiPropertyOptional({
    description: 'Cancellation reason',
    example: null,
    nullable: true,
  })
  cancellationReason: string | null;

  @ApiPropertyOptional({
    description: 'Passenger user details',
    type: UserDto,
    nullable: true,
  })
  passenger?: UserDto;

  @ApiPropertyOptional({
    description: 'Driver user details',
    type: UserDto,
    nullable: true,
  })
  driver: UserDto | null;
}
