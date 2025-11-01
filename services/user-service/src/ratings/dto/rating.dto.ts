import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RatingDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tripId!: string;

  @ApiPropertyOptional()
  passengerId?: string;

  @ApiPropertyOptional()
  driverId?: string;

  @ApiProperty()
  stars!: number;

  @ApiProperty({ nullable: true })
  comment!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
