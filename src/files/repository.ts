import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { AllowedType } from './file-types.js';

export type FileStatus = 'pending' | 'ready' | 'rejected';

export interface FileRecord {
  id: string;
  ownerId: string;
  filename: string;
  contentType: AllowedType;
  size: number;
  status: FileStatus;
  rejectReason?: string;
  createdAt: string;
  // Epoch em segundos, usado como TTL do DynamoDB. Pendente: 24h pra o upload chegar.
  // Pronto: fim da retenção do arquivo. O TTL do DynamoDB pode demorar até 48h pra apagar,
  // então quem lê o registro também confere esse campo.
  expiresAt: number;
}

export interface FileRepository {
  create(record: FileRecord): Promise<void>;
  get(id: string): Promise<FileRecord | null>;
  /** Retorna false se o arquivo não estava mais pendente. */
  markReady(id: string, expiresAt: number): Promise<boolean>;
  markRejected(id: string, reason: string): Promise<boolean>;
}

const key = (id: string) => ({ pk: `FILE#${id}`, sk: 'META' });

export class DynamoFileRepository implements FileRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  async create(record: FileRecord) {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...key(record.id), ...record },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  }

  async get(id: string) {
    const { Item } = await this.client.send(new GetCommand({ TableName: this.table, Key: key(id) }));
    if (!Item) return null;
    const { pk: _pk, sk: _sk, ...record } = Item;
    return record as FileRecord;
  }

  markReady(id: string, expiresAt: number) {
    return this.transition(id, 'SET #status = :next, expiresAt = :expiresAt', { ':next': 'ready', ':expiresAt': expiresAt });
  }

  markRejected(id: string, reason: string) {
    return this.transition(id, 'SET #status = :next, rejectReason = :reason', { ':next': 'rejected', ':reason': reason });
  }

  private async transition(id: string, update: string, values: Record<string, string | number>) {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.table,
          Key: key(id),
          UpdateExpression: update,
          ConditionExpression: '#status = :pending',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':pending': 'pending', ...values },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }
}
