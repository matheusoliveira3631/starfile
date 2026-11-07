import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('aplica os valores padrão', () => {
    expect(loadConfig({})).toEqual({ NODE_ENV: 'development', PORT: 3000, LOG_LEVEL: 'info' });
  });

  it('falha com variável inválida', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
