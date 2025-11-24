/**
 * AWS Client Utilities for LocalStack/AWS
 * Inline copy to avoid workspace module resolution issues
 */

import { SNSClient, PublishCommand, CreateTopicCommand, ListTopicsCommand } from '@aws-sdk/client-sns';
import { 
  SQSClient, 
  ReceiveMessageCommand, 
  DeleteMessageCommand, 
  GetQueueUrlCommand,
  SendMessageCommand,
  CreateQueueCommand,
  ListQueuesCommand,
  GetQueueAttributesCommand,
  PurgeQueueCommand
} from '@aws-sdk/client-sqs';

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const AWS_ENDPOINT = process.env.AWS_ENDPOINT_URL || 'http://localstack:4566';
const IS_LOCALSTACK = process.env.AWS_ENDPOINT_URL?.includes('localstack') || process.env.AWS_ENDPOINT_URL?.includes('localhost');

// SNS Client
let snsClient: SNSClient | null = null;

function getSnsClient(): SNSClient {
  if (!snsClient) {
    snsClient = new SNSClient({
      region: AWS_REGION,
      endpoint: AWS_ENDPOINT,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });
  }
  return snsClient;
}

/**
 * List all SNS topics (for debugging/monitoring)
 */
export async function listTopics() {
  const client = getSnsClient();
  const command = new ListTopicsCommand({});
  const response = await client.send(command);
  return response.Topics || [];
}

/**
 * Create SNS topic (for testing or dynamic topic creation)
 */
export async function createTopic(topicName: string) {
  const client = getSnsClient();
  const command = new CreateTopicCommand({ Name: topicName });
  const response = await client.send(command);
  return response.TopicArn;
}

export async function publishToTopic(topicArn: string, message: object, subject?: string) {
  const client = getSnsClient();
  
  // Extract eventType from message to use as MessageAttribute for filtering
  const messageBody = message as any;
  const eventType = messageBody.eventType;
  
  const command = new PublishCommand({
    TopicArn: topicArn,
    Message: JSON.stringify(message),
    Subject: subject,
    MessageAttributes: eventType ? {
      eventType: {
        DataType: 'String',
        StringValue: eventType,
      },
    } : undefined,
  });
  return await client.send(command);
}

export function getTopicArn(topicName: string): string {
  const accountId = IS_LOCALSTACK ? '000000000000' : process.env.AWS_ACCOUNT_ID || '123456789012';
  return `arn:aws:sns:${AWS_REGION}:${accountId}:${topicName}`;
}

// SQS Client
let sqsClient: SQSClient | null = null;

function getSqsClient(): SQSClient {
  if (!sqsClient) {
    sqsClient = new SQSClient({
      region: AWS_REGION,
      endpoint: AWS_ENDPOINT,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
    });
  }
  return sqsClient;
}

/**
 * List all SQS queues (for debugging/monitoring)
 */
export async function listQueues(queueNamePrefix?: string) {
  const client = getSqsClient();
  const command = new ListQueuesCommand({
    QueueNamePrefix: queueNamePrefix,
  });
  const response = await client.send(command);
  return response.QueueUrls || [];
}

/**
 * Create SQS queue with optional attributes
 * Useful for test setup or dynamic queue creation
 */
export async function createQueue(queueName: string, attributes?: Record<string, string>) {
  const client = getSqsClient();
  const command = new CreateQueueCommand({
    QueueName: queueName,
    Attributes: attributes,
  });
  const response = await client.send(command);
  return response.QueueUrl!;
}

export async function getQueueUrl(queueName: string): Promise<string> {
  const client = getSqsClient();
  const command = new GetQueueUrlCommand({ QueueName: queueName });
  const response = await client.send(command);
  return response.QueueUrl!;
}

export async function receiveMessages(queueUrl: string, maxMessages: number = 10) {
  const client = getSqsClient();
  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: 5,
    MessageAttributeNames: ['All'],
  });
  const response = await client.send(command);
  return response.Messages || [];
}

/**
 * Send message directly to SQS queue (bypass SNS)
 * Useful for priority messages or direct queue operations
 */
export async function sendMessage(queueUrl: string, message: object, delaySeconds?: number) {
  const client = getSqsClient();
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
    DelaySeconds: delaySeconds,
  });
  return await client.send(command);
}

export async function deleteMessage(queueUrl: string, receiptHandle: string) {
  const client = getSqsClient();
  const command = new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  });
  return await client.send(command);
}

/**
 * Get queue attributes (depth, age, etc.) - useful for monitoring
 */
export async function getQueueAttributes(queueUrl: string) {
  const client = getSqsClient();
  const command = new GetQueueAttributesCommand({
    QueueUrl: queueUrl,
    AttributeNames: ['All'],
  });
  const response = await client.send(command);
  return response.Attributes || {};
}

/**
 * Purge queue (delete all messages) - useful for testing cleanup
 */
export async function purgeQueue(queueUrl: string) {
  const client = getSqsClient();
  const command = new PurgeQueueCommand({ QueueUrl: queueUrl });
  return await client.send(command);
}
