import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripsRepository } from './trips.repository';
import { FareModule } from '../fare/fare.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Reflector } from '@nestjs/core';

@Module({
  imports: [FareModule, PrismaModule, NotificationsModule],
  controllers: [TripsController],
  providers: [TripsService, TripsRepository, Reflector],
  exports: [TripsService],
})
export class TripsModule {}
