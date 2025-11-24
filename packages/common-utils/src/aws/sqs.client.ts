/**
 * SQS Client Wrapper for LocalStack/AWS
 * 
 * Story 1.2: Configure Services to Use LocalStack
 */

import { SQSClient, SendMessageCommand, ReceiveMessageCommand, DeleteMessageCommand, CreateQueueCommand } from '@aws-sdk/client-sqs';
import { getAwsConfig, isLocalStack } from './config';

let sqsClient: SQSClient | null = null;

/**
 * Get or create SQS client singleton
 */
export function getSqsClient(): SQSClient {
  if (!sqsClient) {
    const config = getAwsConfig();
    sqsClient = new SQSClient(config);
  }
  return sqsClient;
}

/**
 * Send message to SQS queue
 */
export async function sendMessage(queueUrl: string, message: object) {
  const client = getSqsClient();
  
  const command = new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(message),
  });

  const response = await client.send(command);
  return response;
}

/**
 * Receive messages from SQS queue
 */
export async function receiveMessages(queueUrl: string, maxMessages = 10) {
  const client = getSqsClient();
  
  const command = new ReceiveMessageCommand({
    QueueUrl: queueUrl,
    MaxNumberOfMessages: maxMessages,
    WaitTimeSeconds: 5, // Long polling
  });

  const response = await client.send(command);
  return response.Messages || [];
}

/**
 * Delete message from SQS queue
 */
export async function deleteMessage(queueUrl: string, receiptHandle: string) {
  const client = getSqsClient();
  
  const command = new DeleteMessageCommand({
    QueueUrl: queueUrl,
    ReceiptHandle: receiptHandle,
  });

  await client.send(command);
}

/**
 * Create SQS queue (for LocalStack initialization)
 */
export async function createQueue(queueName: string) {
  const client = getSqsClient();
  
  const command = new CreateQueueCommand({
    QueueName: queueName,
  });

  const response = await client.send(command);
  return response.QueueUrl;
}

/**
 * Build queue URL (LocalStack specific format)
 */
export function getQueueUrl(queueName: string): string {
  const config = getAwsConfig();
  const accountId = isLocalStack() ? '000000000000' : process.env.AWS_ACCOUNT_ID || '123456789012';
  
  if (isLocalStack()) {
    return `${config.endpoint}/${accountId}/${queueName}`;
  }
  
  return `https://sqs.${config.region}.amazonaws.com/${accountId}/${queueName}`;
}
