#!/bin/bash
# Story 2.1: Event-Driven Async Communication
# Creates SNS/SQS resources for async trip-driver matching

set -e

echo "🚀 Initializing Story 2.1 AWS resources..."

# Wait for LocalStack to be ready
until awslocal sns list-topics --region us-east-1 >/dev/null 2>&1; do
  echo "⏳ Waiting for LocalStack SNS to be ready..."
  sleep 2
done

echo "✅ LocalStack is ready!"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Create SNS Topic for trip events
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "📢 Creating SNS topic: trip-events..."
awslocal sns create-topic --name trip-events --region us-east-1 || echo "Topic trip-events already exists"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Create SQS Queues with DLQ
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "📬 Creating SQS queues with Dead Letter Queues..."

# Create Dead Letter Queues first
awslocal sqs create-queue --queue-name driver-match-dlq --region us-east-1 || echo "DLQ driver-match-dlq already exists"
awslocal sqs create-queue --queue-name trip-update-dlq --region us-east-1 || echo "DLQ trip-update-dlq already exists"

# Get DLQ ARNs
DRIVER_MATCH_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/driver-match-dlq \
  --attribute-names QueueArn \
  --region us-east-1 \
  --query 'Attributes.QueueArn' \
  --output text)

TRIP_UPDATE_DLQ_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/trip-update-dlq \
  --attribute-names QueueArn \
  --region us-east-1 \
  --query 'Attributes.QueueArn' \
  --output text)

# Create main queues with DLQ configuration (maxReceiveCount: 3)
awslocal sqs create-queue \
  --queue-name driver-match-queue \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$DRIVER_MATCH_DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" \
  --region us-east-1 || echo "Queue driver-match-queue already exists"

awslocal sqs create-queue \
  --queue-name trip-update-queue \
  --attributes "{\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"$TRIP_UPDATE_DLQ_ARN\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" \
  --region us-east-1 || echo "Queue trip-update-queue already exists"

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# Subscribe SQS Queues to SNS Topic with filters
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo "🔗 Subscribing SQS queues to SNS topic with message filters..."

# Get Topic ARN
TRIP_EVENTS_TOPIC_ARN=$(awslocal sns list-topics --region us-east-1 --query 'Topics[?contains(TopicArn, `trip-events`)].TopicArn' --output text)

# Get Queue ARNs
DRIVER_MATCH_QUEUE_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/driver-match-queue \
  --attribute-names QueueArn \
  --region us-east-1 \
  --query 'Attributes.QueueArn' \
  --output text)

TRIP_UPDATE_QUEUE_ARN=$(awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/trip-update-queue \
  --attribute-names QueueArn \
  --region us-east-1 \
  --query 'Attributes.QueueArn' \
  --output text)

# Subscribe driver-match-queue (filter: TripRequested events only)
awslocal sns subscribe \
  --topic-arn "$TRIP_EVENTS_TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$DRIVER_MATCH_QUEUE_ARN" \
  --attributes "{\"FilterPolicy\":\"{\\\"eventType\\\":[\\\"TripRequested\\\"]}\"}" \
  --region us-east-1 || echo "Subscription driver-match-queue already exists"

# Subscribe trip-update-queue (filter: TripMatched and NoDriversAvailable events)
awslocal sns subscribe \
  --topic-arn "$TRIP_EVENTS_TOPIC_ARN" \
  --protocol sqs \
  --notification-endpoint "$TRIP_UPDATE_QUEUE_ARN" \
  --attributes "{\"FilterPolicy\":\"{\\\"eventType\\\":[\\\"TripMatched\\\",\\\"NoDriversAvailable\\\"]}\"}" \
  --region us-east-1 || echo "Subscription trip-update-queue already exists"

echo ""
echo "✅ Story 2.1 resources initialization complete!"
echo ""
echo "📋 Created resources:"
echo "  SNS Topic:"
echo "    - trip-events (for TripRequested, TripMatched, NoDriversAvailable events)"
echo ""
echo "  SQS Queues:"
echo "    - driver-match-queue (receives TripRequested events)"
echo "    - trip-update-queue (receives TripMatched, NoDriversAvailable events)"
echo ""
echo "  Dead Letter Queues:"
echo "    - driver-match-dlq (maxReceiveCount: 3)"
echo "    - trip-update-dlq (maxReceiveCount: 3)"
echo ""
echo "🔗 Endpoint: http://localhost:4566"
echo "📖 Test with: awslocal sns list-topics --region us-east-1"
