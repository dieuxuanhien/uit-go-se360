# Hybrid Infrastructure Setup - Story 1.1

This directory contains LocalStack initialization scripts for the hybrid infrastructure.

## What is LocalStack?

LocalStack is a fully functional local AWS cloud stack that emulates AWS services. It allows us to:
- Develop and test AWS applications offline
- Validate AWS-compatible architecture at **zero cost**
- Write Terraform code that works with both LocalStack and real AWS

## Services Configured

- **SNS (Simple Notification Service)**: Pub/sub messaging for async communication
- **SQS (Simple Queue Service)**: Message queues for reliable event processing
- **API Gateway**: HTTP API endpoints (for future rate limiting)
- **CloudWatch**: Metrics and monitoring (simulated)

## Initialization Script

`init-aws-resources.sh` runs automatically when LocalStack starts and creates:

### SNS Topics
1. `trip-matching-events` - For async driver-trip matching
2. `driver-location-updates` - For real-time location updates
3. `trip-status-changes` - For trip lifecycle events

### SQS Queues
1. `trip-matching-queue` - Receives trip matching events
2. `driver-location-queue` - Receives location updates
3. `trip-notifications-queue` - Receives trip status notifications

### SNS→SQS Subscriptions
- Each queue is subscribed to its corresponding topic for event-driven async communication

## Usage

### Start LocalStack
```bash
# Start with hybrid stack
docker-compose -f docker-compose.yml -f docker-compose.localstack.yml up -d

# Check LocalStack health
curl http://localhost:4566/_localstack/health

# Wait for initialization (check logs)
docker logs uitgo-localstack
```

### Test AWS Resources
```bash
# List SNS topics
awslocal sns list-topics --region us-east-1

# List SQS queues
awslocal sqs list-queues --region us-east-1

# Send test message to SNS
awslocal sns publish \
  --topic-arn arn:aws:sns:us-east-1:000000000000:trip-matching-events \
  --message '{"tripId": "test-123", "driverId": "driver-456"}' \
  --region us-east-1

# Receive message from SQS
awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/trip-matching-queue \
  --region us-east-1
```

## AWS SDK Configuration

Services connect to LocalStack using environment variables:

```typescript
// AWS SDK v3 configuration
import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';

const snsClient = new SNSClient({
  region: 'us-east-1',
  endpoint: process.env.AWS_ENDPOINT_URL || 'http://localstack:4566',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test'
  }
});
```

## Cost Analysis

| Service | LocalStack (Development) | Real AWS (Production) |
|---------|--------------------------|------------------------|
| SNS | $0 | $0.50 per 1M requests |
| SQS | $0 | $0.40 per 1M requests |
| API Gateway | $0 | $1.00 per 1M requests |
| CloudWatch | $0 | $0.30 per GB ingested |
| **Total** | **$0** | **~$50-100/month** |

## Production Deployment

The same Terraform code works with real AWS by changing the endpoint:

```hcl
provider "aws" {
  region = "us-east-1"
  # endpoint = "http://localhost:4566"  # Comment out for real AWS
}
```

## Troubleshooting

### LocalStack not starting
```bash
# Check if port 4566 is already in use
netstat -an | grep 4566

# View LocalStack logs
docker logs uitgo-localstack -f
```

### Init script not running
```bash
# Manually run init script
docker exec uitgo-localstack /etc/localstack/init/ready.d/init-aws-resources.sh
```

### AWS CLI not working
```bash
# Install awslocal wrapper
pip install awscli-local

# Or use AWS CLI with endpoint
aws --endpoint-url=http://localhost:4566 sns list-topics --region us-east-1
```

## References

- [LocalStack Documentation](https://docs.localstack.cloud/)
- [LocalStack Free Tier Services](https://docs.localstack.cloud/references/coverage/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/)
