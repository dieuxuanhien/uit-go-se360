import { Module } from '@nestjs/common';
import { TripMatchingService } from './trip-matching.service';
import { TripMatchingConsumer } from './trip-matching.consumer';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [DriversModule],
  providers: [TripMatchingService, TripMatchingConsumer],
  exports: [TripMatchingService],
})
export class TripMatchingModule {}
