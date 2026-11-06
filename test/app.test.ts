import { afterAll, describe, expect, it } from 'vitest';
import { testApp } from './helpers.js';

const app = testApp();
afterAll(() => app.close());

describe('GET /health', () => {
  it('responde ok', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
  });

  it('devolve um x-request-id gerado pelo servidor', async () => {
    const res = await app.inject({ method: 'GET', url: '/health', headers: { 'x-request-id': 'injetado' } });
    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('rotas inexistentes', () => {
  it('respondem 404 em JSON', async () => {
    const res = await app.inject({ method: 'GET', url: '/file/123' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: 'not_found' });
  });
});
