import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const required = { BUCKET_NAME: 'b', TABLE_NAME: 't' };

describe('loadConfig', () => {
  it('aplica os valores padrão', () => {
    expect(loadConfig(required)).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      LOG_LEVEL: 'info',
      MAX_UPLOAD_MB: 25,
      UPLOAD_URL_TTL_SECONDS: 300,
    });
  });

  it('exige bucket e tabela', () => {
    expect(() => loadConfig({})).toThrow(/BUCKET_NAME[\s\S]*TABLE_NAME/);
  });

  it('falha com variável inválida', () => {
    expect(() => loadConfig({ ...required, PORT: 'abc' })).toThrow(/PORT/);
  });
});
