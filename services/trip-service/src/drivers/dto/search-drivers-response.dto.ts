import { ApiProperty } from '@nestjs/swagger';

export class NearbyDriverDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'Driver UUID',
  })
  driverId: string;

  @ApiProperty({
    example: 10.762622,
    description: 'Driver current latitude',
  })
  latitude: number;

  @ApiProperty({
    example: 106.660172,
    description: 'Driver current longitude',
  })
  longitude: number;

  @ApiProperty({
    example: 2.5,
    description: 'Distance from search center in kilometers',
  })
  distance: number;
}

export class SearchDriversResponseDto {
  @ApiProperty({
    type: [NearbyDriverDto],
    description: 'List of nearby drivers',
  })
  drivers: NearbyDriverDto[];

  @ApiProperty({
    example: 5,
    description: 'Radius used for search in kilometers',
  })
  searchRadius: number;

  @ApiProperty({
    example: 3,
    description: 'Total number of drivers found',
  })
  totalFound: number;
}
