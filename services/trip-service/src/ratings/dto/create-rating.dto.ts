import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';

export class CreateRatingDto {
  @IsInt()
  @Min(1)
  @Max(5)
  @ApiProperty({ example: 5, minimum: 1, maximum: 5 })
  stars!: number;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  @ApiProperty({ example: 'Great driver!', maxLength: 500, required: false })
  comment?: string;
}
