import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import type { Config } from './config.js';

export function createAwsClients(config: Config) {
  const endpoint = config.AWS_ENDPOINT_URL ? { endpoint: config.AWS_ENDPOINT_URL } : {};

  const s3 = new S3Client({
    region: config.AWS_REGION,
    ...endpoint,
    // LocalStack não resolve bucket como subdomínio de localhost.
    forcePathStyle: Boolean(config.AWS_ENDPOINT_URL),
  });

  const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({ region: config.AWS_REGION, ...endpoint }), {
    marshallOptions: { removeUndefinedValues: true },
  });

  return { s3, dynamo };
}
