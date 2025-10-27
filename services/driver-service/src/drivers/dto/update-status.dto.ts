import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateStatusDto {
  @ApiProperty({
    description: 'Driver online/offline status',
    example: true,
    type: Boolean,
  })
  @IsBoolean()
  isOnline: boolean;
}
