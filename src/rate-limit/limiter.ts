import { UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch em segundos em que a janela atual acaba. */
  resetAt: number;
}

export interface RateLimiter {
  hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

// Janela fixa com contador no DynamoDB.
//
// Contador em memória (o padrão do @fastify/rate-limit) não serve em Lambda: cada instância
// tem a sua memória, então 50 instâncias quentes viram 50 limites diferentes. Aqui o contador
// é um item por janela, incrementado de forma atômica, e o TTL limpa as janelas velhas.
export class DynamoRateLimiter implements RateLimiter {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  async hit(key: string, limit: number, windowSeconds: number) {
    const now = Math.floor(Date.now() / 1000);
    const window = Math.floor(now / windowSeconds);
    const resetAt = (window + 1) * windowSeconds;

    const { Attributes } = await this.client.send(
      new UpdateCommand({
        TableName: this.table,
        Key: { pk: `RATE#${key}#${String(window)}`, sk: 'META' },
        UpdateExpression: 'ADD hits :one SET expiresAt = if_not_exists(expiresAt, :expiresAt)',
        ExpressionAttributeValues: { ':one': 1, ':expiresAt': resetAt + 60 },
        ReturnValues: 'UPDATED_NEW',
      }),
    );

    const hits = Number(Attributes?.hits ?? 1);
    return { allowed: hits <= limit, limit, remaining: Math.max(0, limit - hits), resetAt };
  }
}
