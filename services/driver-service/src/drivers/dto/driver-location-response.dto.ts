import { ApiProperty } from '@nestjs/swagger';

export class DriverLocationResponseDto {
  @ApiProperty({
    description: 'Driver identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  driverId: string;

  @ApiProperty({
    description: 'GPS latitude',
    example: 10.762622,
  })
  latitude: number;

  @ApiProperty({
    description: 'GPS longitude',
    example: 106.660172,
  })
  longitude: number;

  @ApiProperty({
    description: 'Driver online status',
    example: true,
  })
  isOnline: boolean;

  @ApiProperty({
    description: 'Direction of travel in degrees (0-359)',
    example: 45,
    required: false,
  })
  heading?: number;

  @ApiProperty({
    description: 'Speed in km/h',
    example: 30,
    required: false,
  })
  speed?: number;

  @ApiProperty({
    description: 'GPS accuracy in meters',
    example: 10,
    required: false,
  })
  accuracy?: number;

  @ApiProperty({
    description: 'Location update timestamp',
    example: '2025-10-27T10:00:00.000Z',
  })
  timestamp: string;
}
