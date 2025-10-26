import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt, Min, Max, IsNotEmpty } from 'class-validator';

export class CreateDriverProfileDto {
  @ApiProperty({
    description: 'Vehicle manufacturer',
    example: 'Toyota',
  })
  @IsString()
  @IsNotEmpty()
  vehicleMake!: string;

  @ApiProperty({
    description: 'Vehicle model',
    example: 'Camry',
  })
  @IsString()
  @IsNotEmpty()
  vehicleModel!: string;

  @ApiProperty({
    description: 'Vehicle manufacturing year',
    example: 2022,
    minimum: 2000,
    maximum: 2026,
  })
  @IsInt()
  @Min(2000)
  @Max(2026)
  vehicleYear!: number;

  @ApiProperty({
    description: 'Vehicle license plate number',
    example: '51A-12345',
  })
  @IsString()
  @IsNotEmpty()
  vehiclePlate!: string;

  @ApiProperty({
    description: 'Vehicle color',
    example: 'Silver',
  })
  @IsString()
  @IsNotEmpty()
  vehicleColor!: string;

  @ApiProperty({
    description: "Driver's license number",
    example: 'DL123456789',
  })
  @IsString()
  @IsNotEmpty()
  licenseNumber!: string;
}
