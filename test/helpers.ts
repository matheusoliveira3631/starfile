import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

export function testApp() {
  return buildApp(loadConfig({ NODE_ENV: 'test', LOG_LEVEL: 'silent' }));
}
