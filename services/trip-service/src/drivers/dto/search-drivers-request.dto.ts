import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, Min, Max, IsOptional } from 'class-validator';

export class SearchDriversRequestDto {
  @IsNumber()
  @Min(-90)
  @Max(90)
  @ApiProperty({
    example: 10.762622,
    description: 'Latitude of the search center',
    minimum: -90,
    maximum: 90,
  })
  latitude: number;

  @IsNumber()
  @Min(-180)
  @Max(180)
  @ApiProperty({
    example: 106.660172,
    description: 'Longitude of the search center',
    minimum: -180,
    maximum: 180,
  })
  longitude: number;

  @IsNumber()
  @IsOptional()
  @Min(0.1)
  @ApiProperty({
    example: 5,
    description: 'Search radius in kilometers',
    default: 5,
    minimum: 0.1,
  })
  radius?: number = 5;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @ApiProperty({
    example: 5,
    description: 'Maximum number of drivers to return',
    default: 5,
    minimum: 1,
  })
  limit?: number = 5;
}
