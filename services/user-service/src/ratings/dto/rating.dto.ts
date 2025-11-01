import { ApiProperty } from '@nestjs/swagger';

export class RatingDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tripId!: string;

  @ApiProperty()
  passengerId!: string;

  @ApiProperty()
  driverId!: string;

  @ApiProperty()
  stars!: number;

  @ApiProperty({ nullable: true })
  comment!: string | null;

  @ApiProperty()
  createdAt!: Date;
}
