import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateAvailabilityDto {
  @ApiProperty({
    description: 'Driver availability status (false when assigned to a trip)',
    example: false,
    type: Boolean,
  })
  @IsBoolean()
  isAvailable: boolean;

  @ApiPropertyOptional({
    description: 'Trip ID that the driver is assigned to (required when isAvailable=false)',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsOptional()
  @IsUUID()
  tripId?: string;
}
