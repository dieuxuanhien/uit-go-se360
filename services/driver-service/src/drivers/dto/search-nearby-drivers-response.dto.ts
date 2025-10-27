import { ApiProperty } from '@nestjs/swagger';
import { NearbyDriverResponseDto } from './nearby-driver-response.dto';

export class SearchNearbyDriversResponseDto {
  @ApiProperty({
    description: 'Array of nearby drivers sorted by distance',
    type: [NearbyDriverResponseDto],
  })
  drivers: NearbyDriverResponseDto[];

  @ApiProperty({
    description: 'Search radius in kilometers',
    example: 5,
  })
  searchRadius: number;

  @ApiProperty({
    description: 'Total number of drivers found',
    example: 2,
  })
  totalFound: number;
}
