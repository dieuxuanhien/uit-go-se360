import { IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateLocationDto {
  @ApiProperty({
    description: 'GPS latitude',
    example: 10.762622,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({
    description: 'GPS longitude',
    example: 106.660172,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({
    description: 'Direction of travel in degrees (0-359)',
    example: 45,
    required: false,
    minimum: 0,
    maximum: 359,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(359)
  heading?: number;

  @ApiProperty({
    description: 'Speed in km/h',
    example: 30,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  speed?: number;

  @ApiProperty({
    description: 'GPS accuracy in meters',
    example: 10,
    required: false,
  })
  @IsOptional()
  @IsNumber()
  accuracy?: number;
}
