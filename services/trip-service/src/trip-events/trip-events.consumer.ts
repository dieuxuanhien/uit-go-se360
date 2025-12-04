import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { receiveMessages, deleteMessage, getQueueUrl } from '../common/aws.utils';
import { TripEventsService } from './trip-events.service';

/**
 * Story 2.1: SQS Consumer for Trip Status Updates
 * Polls trip-update-queue for TripMatched events
 */
@Injectable()
export class TripEventsConsumer implements OnModuleInit {
  private readonly logger = new Logger(TripEventsConsumer.name);
  private queueUrl!: string;
  private isRunning = false;
  private readonly processedMessageIds = new Set<string>();

  constructor(private readonly tripEventsService: TripEventsService) {}

  /**
   * Start polling when module initializes
   */
  async onModuleInit() {
    this.logger.log('Initializing Trip Events Consumer...');
    this.queueUrl = await getQueueUrl('trip-update-queue');
    this.logger.log(`Queue URL: ${this.queueUrl}`);
    this.startPolling();
  }

  /**
   * Poll SQS queue continuously
   */
  private async startPolling() {
    if (this.isRunning) {
      this.logger.warn('Polling already running');
      return;
    }

    this.isRunning = true;
    this.logger.log('🚀 Starting SQS polling for trip-update queue...');

    while (this.isRunning) {
      try {
        await this.pollOnce();
      } catch (error) {
        this.logger.error('Error in polling loop', {
          error: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        });
        // Wait 5s before retrying on error
        await this.sleep(5000);
      }
    }
  }

  /**
   * Poll queue once and process messages
   */
  private async pollOnce() {
    try {
      const messages = await receiveMessages(this.queueUrl, 10);

      if (messages.length === 0) {
        // No messages, continue polling (long polling already waits 5s)
        return;
      }

      this.logger.log(`📬 Received ${messages.length} messages from queue`);

      for (const message of messages) {
        try {
          await this.processMessage(message);
          
          // Delete message after successful processing
          if (message.ReceiptHandle) {
            await deleteMessage(this.queueUrl, message.ReceiptHandle);
            this.logger.log('✅ Message deleted from queue', {
              messageId: message.MessageId,
            });
          }
        } catch (error) {
          this.logger.error('Failed to process message', {
            messageId: message.MessageId,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          // Message will be retried (maxReceiveCount: 3) then sent to DLQ
        }
      }
    } catch (error) {
      this.logger.error('Failed to receive messages', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Process individual SQS message
   */
  private async processMessage(message: any) {
    const messageId = message.MessageId;
    
    // Idempotency check - don't process same message twice
    if (this.processedMessageIds.has(messageId)) {
      this.logger.warn('Message already processed (duplicate)', { messageId });
      return;
    }

    try {
      // Parse SNS message wrapper
      const snsMessage = JSON.parse(message.Body);
      const event = JSON.parse(snsMessage.Message);

      this.logger.log('📨 Processing event', {
        messageId,
        tripId: event.tripId,
        eventType: event.eventType,
      });

      // Route based on event type
      switch (event.eventType) {
        case 'TripMatched':
          await this.tripEventsService.handleTripMatched({
            tripId: event.tripId,
            driverId: event.driverId,
            passengerId: event.passengerId,
            driverDistance: event.driverDistance,
            matchedAt: event.matchedAt,
          });
          break;

        case 'NoDriversAvailable':
          await this.tripEventsService.handleNoDriversAvailable({
            tripId: event.tripId,
            passengerId: event.passengerId,
            searchAttempts: event.searchAttempts,
            searchDurationMs: event.searchDurationMs,
            maxRadiusKm: event.maxRadiusKm,
            failedAt: event.failedAt,
          });
          break;

        default:
          this.logger.warn('Unknown event type, skipping', {
            messageId,
            eventType: event.eventType,
          });
          return;
      }

      // Mark as processed
      this.processedMessageIds.add(messageId);

      // Clean up old message IDs (keep last 10,000)
      if (this.processedMessageIds.size > 10000) {
        const idsArray = Array.from(this.processedMessageIds);
        this.processedMessageIds.clear();
        idsArray.slice(-5000).forEach((id) => this.processedMessageIds.add(id));
      }
    } catch (error) {
      this.logger.error('Failed to parse or process message', {
        messageId,
        error: error instanceof Error ? error.message : 'Unknown error',
        body: message.Body,
      });
      throw error; // Re-throw to trigger retry
    }
  }

  /**
   * Graceful shutdown
   */
  async onModuleDestroy() {
    this.logger.log('Stopping SQS polling...');
    this.isRunning = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
