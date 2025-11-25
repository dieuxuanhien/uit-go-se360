import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from './cache.service';

/**
 * Cache Module for User Service
 * Provides CacheService instance configured for Redis Cluster
 */
@Global()
@Module({
  providers: [
    {
      provide: CacheService,
      useFactory: (configService: ConfigService) => {
        const nodes = configService.get('cache.nodes', []);
        
        if (nodes.length === 0) {
          throw new Error('Redis cluster nodes not configured');
        }

        return new CacheService({ nodes });
      },
      inject: [ConfigService],
    },
  ],
  exports: [CacheService],
})
export class CacheModule {}
