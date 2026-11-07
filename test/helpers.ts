import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { InMemoryFiles, InMemoryLinks, InMemoryStorage } from './fakes.js';

export const testConfig = (env: Record<string, string> = {}) =>
  loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent', BUCKET_NAME: 'test', TABLE_NAME: 'test', ...env });

export function testApp(env: Record<string, string> = {}) {
  const files = new InMemoryFiles();
  const links = new InMemoryLinks();
  const storage = new InMemoryStorage();
  const app = buildApp(testConfig(env), { files, links, storage });
  return { app, files, links, storage };
}
