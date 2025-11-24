import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { PrismaReplicaService } from './database-replica.service';

@Module({
  providers: [DatabaseService, PrismaReplicaService],
  exports: [DatabaseService, PrismaReplicaService],
})
export class DatabaseModule {}
