import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripsRepository } from './trips.repository';
import { FareModule } from '../fare/fare.module';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [FareModule, PrismaModule],
  controllers: [TripsController],
  providers: [TripsService, TripsRepository],
  exports: [TripsService],
})
export class TripsModule {}
