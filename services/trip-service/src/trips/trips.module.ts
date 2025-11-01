import { Module } from '@nestjs/common';
import { TripsController } from './trips.controller';
import { TripsService } from './trips.service';
import { TripsRepository } from './trips.repository';
import { FareModule } from '../fare/fare.module';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { Reflector } from '@nestjs/core';
import { DriverServiceClient } from '../integrations/driver-service.client';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [FareModule, PrismaModule, NotificationsModule, HttpModule],
  controllers: [TripsController],
  providers: [TripsService, TripsRepository, DriverServiceClient, Reflector],
  exports: [TripsService],
})
export class TripsModule {}
