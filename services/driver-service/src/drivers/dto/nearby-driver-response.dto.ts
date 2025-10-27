import { ApiProperty } from '@nestjs/swagger';

export class NearbyDriverResponseDto {
  @ApiProperty({
    description: 'Driver identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  driverId: string;

  @ApiProperty({
    description: 'Driver latitude',
    example: 10.762822,
  })
  latitude: number;

  @ApiProperty({
    description: 'Driver longitude',
    example: 106.660372,
  })
  longitude: number;

  @ApiProperty({
    description: 'Distance from search center in meters',
    example: 150,
  })
  distance: number;

  @ApiProperty({
    description: 'Driver online status',
    example: true,
  })
  isOnline: boolean;
}
