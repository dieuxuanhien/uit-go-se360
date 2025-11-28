import { registerAs } from '@nestjs/config';

export default registerAs('redis', () => {
  // Check if cluster mode is enabled
  const clusterMode = process.env.REDIS_CLUSTER_MODE === 'true';
  
  if (clusterMode) {
    // Redis Cluster configuration (6 nodes: 3 primaries + 3 replicas)
    const clusterNodes = process.env.REDIS_CLUSTER_NODES || 
      'redis-node-1:6379,redis-node-2:6379,redis-node-3:6379,redis-node-4:6379,redis-node-5:6379,redis-node-6:6379';
    
    return {
      clusterMode: true,
      nodes: clusterNodes.split(',').map(node => {
        const [host, port] = node.trim().split(':');
        return { host, port: parseInt(port || '6379', 10) };
      }),
      password: process.env.REDIS_PASSWORD || undefined,
      // Cluster-specific options
      scaleReads: 'slave', // Read from replicas for better performance
      redisOptions: {
        password: process.env.REDIS_PASSWORD || undefined,
      },
    };
  }
  
  // Standalone Redis configuration (default)
  return {
    clusterMode: false,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  };
});
