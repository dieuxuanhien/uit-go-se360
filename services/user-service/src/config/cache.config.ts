import { registerAs } from '@nestjs/config';

export default registerAs('cache', () => ({
  nodes: [
    { host: process.env.REDIS_NODE_1_HOST || 'redis-node-1', port: parseInt(process.env.REDIS_NODE_1_PORT || '6379', 10) },
    { host: process.env.REDIS_NODE_2_HOST || 'redis-node-2', port: parseInt(process.env.REDIS_NODE_2_PORT || '6379', 10) },
    { host: process.env.REDIS_NODE_3_HOST || 'redis-node-3', port: parseInt(process.env.REDIS_NODE_3_PORT || '6379', 10) },
    { host: process.env.REDIS_NODE_4_HOST || 'redis-node-4', port: parseInt(process.env.REDIS_NODE_4_PORT || '6379', 10) },
    { host: process.env.REDIS_NODE_5_HOST || 'redis-node-5', port: parseInt(process.env.REDIS_NODE_5_PORT || '6379', 10) },
    { host: process.env.REDIS_NODE_6_HOST || 'redis-node-6', port: parseInt(process.env.REDIS_NODE_6_PORT || '6379', 10) },
  ],
  ttl: {
    user: parseInt(process.env.CACHE_TTL_USER || '3600', 10), // 1 hour
    driverProfile: parseInt(process.env.CACHE_TTL_DRIVER_PROFILE || '1800', 10), // 30 minutes
  },
}));
