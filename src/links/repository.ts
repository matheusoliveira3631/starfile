import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';

export interface LinkRecord {
  linkId: string;
  fileId: string;
  tokenHash: string;
  createdAt: string;
  // Epoch em segundos, também é o TTL do item.
  expiresAt: number;
  maxDownloads?: number;
  downloads: number;
}

export interface LinkRepository {
  create(link: LinkRecord): Promise<void>;
  findByTokenHash(tokenHash: string): Promise<LinkRecord | null>;
  listByFile(fileId: string): Promise<LinkRecord[]>;
  /** Retorna false se o link não existia. */
  delete(fileId: string, linkId: string): Promise<boolean>;
  /**
   * Conta um download, se o link ainda vale. A checagem e o incremento são uma operação só,
   * então dois downloads simultâneos não passam do limite.
   */
  consume(fileId: string, linkId: string, now: number): Promise<boolean>;
}

export const TOKEN_INDEX = 'byTokenHash';

const key = (fileId: string, linkId: string) => ({ pk: `FILE#${fileId}`, sk: `LINK#${linkId}` });

function toRecord(item: Record<string, unknown>): LinkRecord {
  const { pk: _pk, sk: _sk, ...record } = item;
  return record as unknown as LinkRecord;
}

export class DynamoLinkRepository implements LinkRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  async create(link: LinkRecord) {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...key(link.fileId, link.linkId), ...link },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  }

  // O índice é eventualmente consistente, por isso ele só serve pra achar o link.
  // Quem decide se o download vale é o consume(), que lê a tabela principal.
  async findByTokenHash(tokenHash: string) {
    const { Items } = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: TOKEN_INDEX,
        KeyConditionExpression: 'tokenHash = :hash',
        ExpressionAttributeValues: { ':hash': tokenHash },
        Limit: 1,
      }),
    );
    const item = Items?.[0];
    return item ? toRecord(item) : null;
  }

  async listByFile(fileId: string) {
    const { Items = [] } = await this.client.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: 'pk = :pk AND begins_with(sk, :prefix)',
        ExpressionAttributeValues: { ':pk': `FILE#${fileId}`, ':prefix': 'LINK#' },
      }),
    );
    return Items.map(toRecord);
  }

  async delete(fileId: string, linkId: string) {
    const { Attributes } = await this.client.send(
      new DeleteCommand({ TableName: this.table, Key: key(fileId, linkId), ReturnValues: 'ALL_OLD' }),
    );
    return Boolean(Attributes);
  }

  async consume(fileId: string, linkId: string, now: number) {
    try {
      await this.client.send(
        new UpdateCommand({
          TableName: this.table,
          Key: key(fileId, linkId),
          UpdateExpression: 'SET downloads = downloads + :one',
          ConditionExpression:
            'attribute_exists(pk) AND expiresAt > :now AND (attribute_not_exists(maxDownloads) OR downloads < maxDownloads)',
          ExpressionAttributeValues: { ':one': 1, ':now': now },
        }),
      );
      return true;
    } catch (error) {
      if (error instanceof ConditionalCheckFailedException) return false;
      throw error;
    }
  }
}
