import { Module } from '@nestjs/common';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { RedisModule } from '../redis/redis.module';
import { InternalApiGuard } from '../common/guards/internal-api.guard';

@Module({
  imports: [RedisModule],
  controllers: [DriversController],
  providers: [DriversService, InternalApiGuard],
  exports: [DriversService],
})
export class DriversModule {}
