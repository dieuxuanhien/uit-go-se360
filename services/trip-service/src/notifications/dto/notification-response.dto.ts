import { ApiProperty } from '@nestjs/swagger';

export class NotificationDto {
  @ApiProperty({
    description: 'Notification ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  notificationId: string;

  @ApiProperty({
    description: 'Trip ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  tripId: string;

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

  @ApiProperty({
    description: 'Time remaining in seconds before notification expires',
    example: 12,
  })
  timeRemainingSeconds: number;

  @ApiProperty({
    description: 'Notification timestamp',
    example: '2025-11-01T10:30:00Z',
  })
  notifiedAt: Date;
}
