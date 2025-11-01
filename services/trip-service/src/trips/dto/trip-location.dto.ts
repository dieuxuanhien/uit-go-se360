import { ApiProperty } from '@nestjs/swagger';

export class TripLocationDto {
  @ApiProperty({
    description: 'Trip ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  tripId: string;

  @ApiProperty({
    description: 'Driver ID',
    example: '456e7890-e89b-12d3-a456-426614174001',
  })
  driverId: string;

  @ApiProperty({
    description: 'Driver latitude',
    example: 10.762622,
  })
  latitude: number;

  @ApiProperty({
    description: 'Driver longitude',
    example: 106.660172,
  })
  longitude: number;

  @ApiProperty({
    description: 'Driver heading in degrees (0-359)',
    example: 45,
    required: false,
  })
  heading?: number;

  @ApiProperty({
    description: 'Driver speed in km/h',
    example: 30.5,
    required: false,
  })
  speed?: number;

  @ApiProperty({
    description: 'Location accuracy in meters',
    example: 10.2,
    required: false,
  })
  accuracy?: number;

  @ApiProperty({
    description: 'Location timestamp',
    example: '2025-11-01T10:35:30Z',
  })
  timestamp: Date;
}
