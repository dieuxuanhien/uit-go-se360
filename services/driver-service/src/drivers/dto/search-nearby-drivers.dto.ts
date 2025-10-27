import { IsNumber, IsOptional, IsInt, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SearchNearbyDriversDto {
  @ApiProperty({
    description: 'Search center latitude',
    example: 10.762622,
    minimum: -90,
    maximum: 90,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({
    description: 'Search center longitude',
    example: 106.660172,
    minimum: -180,
    maximum: 180,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({
    description: 'Search radius in kilometers',
    example: 5,
    default: 5,
    required: false,
    minimum: 0.1,
    maximum: 50,
  })
  @Type(() => Number)
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(50)
  radius?: number = 5;

  @ApiProperty({
    description: 'Maximum number of results',
    example: 10,
    default: 10,
    required: false,
    minimum: 1,
    maximum: 50,
  })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;
}
