import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { DriverNotificationService } from './driver-notification.service';
import { DriverServiceClient } from '../drivers/driver-service.client';
import { PrismaModule } from '../prisma/prisma.module';
import driverNotificationConfig from '../config/driver-notification.config';

@Module({
  imports: [
    HttpModule,
    ConfigModule.forFeature(driverNotificationConfig),
    PrismaModule,
  ],
  providers: [DriverNotificationService, DriverServiceClient],
  exports: [DriverNotificationService],
})
export class NotificationsModule {}
