/**
 * SNS Client Wrapper for LocalStack/AWS
 * 
 * Story 1.2: Configure Services to Use LocalStack
 */

import { SNSClient, PublishCommand, CreateTopicCommand } from '@aws-sdk/client-sns';
import { getAwsConfig, isLocalStack } from './config';

let snsClient: SNSClient | null = null;

/**
 * Get or create SNS client singleton
 */
export function getSnsClient(): SNSClient {
  if (!snsClient) {
    const config = getAwsConfig();
    snsClient = new SNSClient(config);
  }
  return snsClient;
}

/**
 * Publish message to SNS topic
 */
export async function publishToTopic(topicArn: string, message: object, subject?: string) {
  const client = getSnsClient();
  
  const command = new PublishCommand({
    TopicArn: topicArn,
    Message: JSON.stringify(message),
    Subject: subject,
  });

  const response = await client.send(command);
  return response;
}

/**
 * Create SNS topic (for LocalStack initialization)
 */
export async function createTopic(topicName: string) {
  const client = getSnsClient();
  
  const command = new CreateTopicCommand({
    Name: topicName,
  });

  const response = await client.send(command);
  return response.TopicArn;
}

/**
 * Build topic ARN (LocalStack uses 000000000000 as account ID)
 */
export function getTopicArn(topicName: string): string {
  const config = getAwsConfig();
  const accountId = isLocalStack() ? '000000000000' : process.env.AWS_ACCOUNT_ID || '123456789012';
  return `arn:aws:sns:${config.region}:${accountId}:${topicName}`;
}
