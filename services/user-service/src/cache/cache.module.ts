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
          console.warn('[CacheModule] ⚠️ Redis cluster nodes not configured - caching disabled');
          console.warn('[CacheModule] App will work but without caching (all queries hit database)');
          // Return null - repositories will handle gracefully
          return null;
        }

        return new CacheService({ nodes });
      },
      inject: [ConfigService],
    },
  ],
  exports: [CacheService],
})
export class CacheModule {}
