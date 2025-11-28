import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DriverStatusResponseDto {
  @ApiProperty({
    description: 'Driver UUID',
    example: '550e8400-e29b-41d4-a716-446655440000',
    format: 'uuid',
  })
  driverId: string;

  @ApiProperty({
    description: 'Driver online/offline status',
    example: true,
  })
  isOnline: boolean;

  @ApiProperty({
    description: 'Driver availability for new trips (false when serving a trip)',
    example: true,
  })
  isAvailable: boolean;

  @ApiPropertyOptional({
    description: 'Current trip ID if driver is serving a passenger',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  currentTripId?: string | null;

  @ApiProperty({
    description: 'Status update timestamp',
    example: '2025-10-27T10:00:00.000Z',
    format: 'date-time',
  })
  timestamp: string;
}
