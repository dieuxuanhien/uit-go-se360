import { Module } from '@nestjs/common';
import { TripEventsService } from './trip-events.service';
import { TripEventsConsumer } from './trip-events.consumer';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [TripEventsService, TripEventsConsumer],
  exports: [TripEventsService],
})
export class TripEventsModule {}
