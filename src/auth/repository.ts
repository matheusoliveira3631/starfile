import { DeleteCommand, GetCommand, PutCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface ApiKeyRecord {
  keyHash: string;
  ownerId: string;
  name: string;
  prefix: string;
  createdAt: string;
}

export interface ApiKeyRepository {
  create(record: ApiKeyRecord): Promise<void>;
  findByHash(keyHash: string): Promise<ApiKeyRecord | null>;
  /** Retorna false se a chave não existia. */
  delete(keyHash: string): Promise<boolean>;
}

const key = (keyHash: string) => ({ pk: `APIKEY#${keyHash}`, sk: 'META' });

// A busca é direto pelo hash, na tabela principal (leitura consistente):
// chave revogada para de funcionar na requisição seguinte.
export class DynamoApiKeyRepository implements ApiKeyRepository {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly table: string,
  ) {}

  async create(record: ApiKeyRecord) {
    await this.client.send(
      new PutCommand({
        TableName: this.table,
        Item: { ...key(record.keyHash), ...record },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
  }

  async findByHash(keyHash: string) {
    const { Item } = await this.client.send(
      new GetCommand({ TableName: this.table, Key: key(keyHash), ConsistentRead: true }),
    );
    if (!Item) return null;
    const { pk: _pk, sk: _sk, ...record } = Item;
    return record as ApiKeyRecord;
  }

  async delete(keyHash: string) {
    const { Attributes } = await this.client.send(
      new DeleteCommand({ TableName: this.table, Key: key(keyHash), ReturnValues: 'ALL_OLD' }),
    );
    return Boolean(Attributes);
  }
}
