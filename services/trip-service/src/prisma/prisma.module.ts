import { Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaReplicaService } from './prisma-replica.service';

@Module({
  providers: [PrismaService, PrismaReplicaService],
  exports: [PrismaService, PrismaReplicaService],
})
export class PrismaModule {}
