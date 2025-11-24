/**
 * AWS SDK Configuration for LocalStack
 * 
 * This configuration works with both LocalStack (development) and real AWS (production).
 * Set AWS_ENDPOINT_URL environment variable to use LocalStack.
 * 
 * Story 1.2: Configure Services to Use LocalStack
 */

export interface AwsConfig {
  region: string;
  endpoint?: string;
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

/**
 * Get AWS configuration based on environment
 * 
 * LocalStack (Development):
 * - Uses AWS_ENDPOINT_URL=http://localstack:4566
 * - Test credentials (LocalStack doesn't validate)
 * 
 * Real AWS (Production):
 * - No endpoint override
 * - Uses IAM role credentials from ECS/EC2
 */
export function getAwsConfig(): AwsConfig {
  const config: AwsConfig = {
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
    },
  };

  // LocalStack endpoint override
  if (process.env.AWS_ENDPOINT_URL) {
    config.endpoint = process.env.AWS_ENDPOINT_URL;
  }

  return config;
}

/**
 * Check if running against LocalStack
 */
export function isLocalStack(): boolean {
  return !!process.env.AWS_ENDPOINT_URL;
}

/**
 * Get environment display name
 */
export function getEnvironmentName(): string {
  if (isLocalStack()) {
    return 'LocalStack (Development)';
  }
  return `AWS ${process.env.AWS_REGION || 'us-east-1'} (Production)`;
}
