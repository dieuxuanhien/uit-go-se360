import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DriverProfilesController } from './driver-profiles.controller';
import { DriverProfilesService } from './driver-profiles.service';
import { DriverProfilesRepository } from './driver-profiles.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [DriverProfilesController],
  providers: [DriverProfilesService, DriverProfilesRepository],
  exports: [DriverProfilesService],
})
export class DriverProfilesModule {}
