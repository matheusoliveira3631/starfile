import { randomBytes } from 'node:crypto';
import { CreateTableCommand } from '@aws-sdk/client-dynamodb';
import { CreateBucketCommand } from '@aws-sdk/client-s3';
import { pino } from 'pino';
import { buildApp, defaultDeps } from '../../src/app.js';
import { apiKeyPrefix, generateApiKey, hashApiKey } from '../../src/auth/api-keys.js';
import { createAwsClients } from '../../src/aws.js';
import { loadConfig } from '../../src/config.js';
import { validateUpload } from '../../src/files/validate-upload.js';
import { TOKEN_INDEX } from '../../src/links/repository.js';

const ENDPOINT = process.env.LOCALSTACK_URL ?? 'http://localhost:4566';

// Sempre as credenciais do LocalStack, mesmo que a máquina tenha outras configuradas:
// com a checagem de assinatura ligada, ele só aceita o que foi assinado com "test".
// E isso garante que um teste de integração nunca fale com uma conta de verdade.
process.env.AWS_ACCESS_KEY_ID = 'test';
process.env.AWS_SECRET_ACCESS_KEY = 'test';
delete process.env.AWS_SESSION_TOKEN;
delete process.env.AWS_PROFILE;

// Cada arquivo de teste ganha bucket e tabela próprios, então podem rodar em paralelo.
export async function integrationContext(env: Record<string, string> = {}) {
  const name = `it-${randomBytes(4).toString('hex')}`;
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    AWS_ENDPOINT_URL: ENDPOINT,
    BUCKET_NAME: name,
    TABLE_NAME: name,
    ...env,
  });
  const { s3, dynamo } = createAwsClients(config);

  await s3.send(new CreateBucketCommand({ Bucket: name }));
  await dynamo.send(
    new CreateTableCommand({
      TableName: name,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'pk', KeyType: 'HASH' },
        { AttributeName: 'sk', KeyType: 'RANGE' },
      ],
      AttributeDefinitions: [
        { AttributeName: 'pk', AttributeType: 'S' },
        { AttributeName: 'sk', AttributeType: 'S' },
        { AttributeName: 'tokenHash', AttributeType: 'S' },
      ],
      GlobalSecondaryIndexes: [
        {
          IndexName: TOKEN_INDEX,
          KeySchema: [{ AttributeName: 'tokenHash', KeyType: 'HASH' }],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    }),
  );

  const deps = defaultDeps(config);
  const app = buildApp(config, deps);

  const key = generateApiKey();
  await deps.apiKeys.create({
    keyHash: hashApiKey(key),
    ownerId: 'alice',
    name: 'integração',
    prefix: apiKeyPrefix(key),
    createdAt: new Date().toISOString(),
  });
  const auth = { authorization: `Bearer ${key}` };

  // No ambiente real quem chama é o evento do S3. Aqui o teste chama direto.
  const validate = (fileId: string) =>
    validateUpload(`pending/${fileId}`, { ...deps, log: pino({ level: 'silent' }), retentionSeconds: 86400 });

  return { config, deps, app, key, auth, validate };
}

export interface UploadForm {
  url: string;
  fields: Record<string, string>;
}

/** Envia o arquivo pro S3 do jeito que um cliente faria, e devolve status e código de erro do S3. */
export async function sendToS3(form: UploadForm, bytes: Uint8Array, overrideFields: Record<string, string> = {}) {
  const body = new FormData();
  for (const [field, value] of Object.entries({ ...form.fields, ...overrideFields })) body.append(field, value);
  body.append('file', new Blob([bytes]));
  const res = await fetch(form.url, { method: 'POST', body });
  const text = await res.text();
  return { status: res.status, code: /<Code>(.*?)<\/Code>/.exec(text)?.[1] ?? null };
}

export async function s3ErrorCode(res: Response) {
  return /<Code>(.*?)<\/Code>/.exec(await res.text())?.[1] ?? null;
}
