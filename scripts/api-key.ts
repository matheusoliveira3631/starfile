// Cria e revoga API keys.
//
//   npm run api-key -- create <dono> "<nome da chave>"
//   npm run api-key -- revoke <chave>
//
// A chave aparece uma vez só, na criação. Depois disso só o hash existe.
import { apiKeyPrefix, generateApiKey, hashApiKey, isApiKeyFormat, isOwnerId } from '../src/auth/api-keys.js';
import { DynamoApiKeyRepository } from '../src/auth/repository.js';
import { createAwsClients } from '../src/aws.js';
import { loadConfig } from '../src/config.js';

const [command, ...args] = process.argv.slice(2);

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const config = loadConfig();
const repo = new DynamoApiKeyRepository(createAwsClients(config).dynamo, config.TABLE_NAME);

if (command === 'create') {
  const [ownerId = '', name = 'sem nome'] = args;
  if (!isOwnerId(ownerId)) fail('Dono inválido: use 3 a 40 caracteres, minúsculas, números e hífen.');

  const key = generateApiKey();
  await repo.create({
    keyHash: hashApiKey(key),
    ownerId,
    name,
    prefix: apiKeyPrefix(key),
    createdAt: new Date().toISOString(),
  });
  console.log(`Chave criada para ${ownerId}. Guarde agora, ela não aparece de novo:\n\n${key}\n`);
} else if (command === 'revoke') {
  const [key = ''] = args;
  if (!isApiKeyFormat(key)) fail('Formato de chave inválido.');
  const deleted = await repo.delete(hashApiKey(key));
  console.log(deleted ? `Chave ${apiKeyPrefix(key)}… revogada.` : 'Chave não encontrada.');
} else {
  fail('Uso: npm run api-key -- create <dono> "<nome>" | revoke <chave>');
}
