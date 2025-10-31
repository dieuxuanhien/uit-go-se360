import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  IsString,
  IsNotEmpty,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class CreateTripDto {
  @ApiProperty({
    description: 'Pickup location latitude',
    example: 10.762622,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  pickupLatitude: number;

  @ApiProperty({
    description: 'Pickup location longitude',
    example: 106.660172,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  pickupLongitude: number;

  @ApiProperty({
    description: 'Pickup location address',
    example: 'District 1, Ho Chi Minh City',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty({ message: 'Pickup address is required' })
  @MaxLength(500, { message: 'Pickup address must not exceed 500 characters' })
  pickupAddress: string;

  @ApiProperty({
    description: 'Destination location latitude',
    example: 10.823099,
    minimum: -90,
    maximum: 90,
  })
  @IsNumber()
  @Min(-90, { message: 'Latitude must be between -90 and 90' })
  @Max(90, { message: 'Latitude must be between -90 and 90' })
  destinationLatitude: number;

  @ApiProperty({
    description: 'Destination location longitude',
    example: 106.629662,
    minimum: -180,
    maximum: 180,
  })
  @IsNumber()
  @Min(-180, { message: 'Longitude must be between -180 and 180' })
  @Max(180, { message: 'Longitude must be between -180 and 180' })
  destinationLongitude: number;

  @ApiProperty({
    description: 'Destination location address',
    example: 'Tan Binh District, Ho Chi Minh City',
    maxLength: 500,
  })
  @IsString()
  @IsNotEmpty({ message: 'Destination address is required' })
  @MaxLength(500, {
    message: 'Destination address must not exceed 500 characters',
  })
  destinationAddress: string;
}
