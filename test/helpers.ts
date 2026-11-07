import { buildApp } from '../src/app.js';
import { apiKeyPrefix, generateApiKey, hashApiKey } from '../src/auth/api-keys.js';
import { loadConfig } from '../src/config.js';
import { InMemoryApiKeys, InMemoryFiles, InMemoryLinks, InMemoryRateLimiter, InMemoryStorage } from './fakes.js';

export const testConfig = (env: Record<string, string> = {}) =>
  loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', BUCKET_NAME: 'test', TABLE_NAME: 'test', ...env });

export async function createKey(apiKeys: InMemoryApiKeys, ownerId: string) {
  const key = generateApiKey();
  await apiKeys.create({ keyHash: hashApiKey(key), ownerId, name: 'teste', prefix: apiKeyPrefix(key), createdAt: '' });
  return key;
}

export async function testApp(env: Record<string, string> = {}) {
  const deps = {
    apiKeys: new InMemoryApiKeys(),
    limiter: new InMemoryRateLimiter(),
    files: new InMemoryFiles(),
    links: new InMemoryLinks(),
    storage: new InMemoryStorage(),
  };
  const app = buildApp(testConfig(env), deps);
  const keys = { alice: await createKey(deps.apiKeys, 'alice'), bob: await createKey(deps.apiKeys, 'bob') };
  const as = (owner: keyof typeof keys) => ({ authorization: `Bearer ${keys[owner]}` });
  return { app, ...deps, keys, as };
}
