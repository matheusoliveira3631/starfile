import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey, isApiKeyFormat } from '../src/auth/api-keys.js';
import { testApp } from './helpers.js';

let ctx: Awaited<ReturnType<typeof testApp>>;
beforeEach(async () => {
  ctx = await testApp();
});
afterEach(() => ctx.app.close());

const upload = { filename: 'a.txt', contentType: 'text/plain', size: 10 };

describe('API keys', () => {
  it('têm formato fixo e 256 bits', () => {
    const key = generateApiKey();
    expect(isApiKeyFormat(key)).toBe(true);
    expect(Buffer.from(key.slice(3), 'base64url')).toHaveLength(32);
  });

  it('ficam salvas só como hash', () => {
    const stored = [...ctx.apiKeys.records.values()];
    expect(JSON.stringify(stored)).not.toContain(ctx.keys.alice);
    expect(ctx.apiKeys.records.has(hashApiKey(ctx.keys.alice))).toBe(true);
  });
});

describe('autenticação', () => {
  it.each([
    ['sem header', {}],
    ['esquema errado', { authorization: `Basic ${'x'.repeat(10)}` }],
    ['formato inválido', { authorization: 'Bearer abc' }],
    ['chave que não existe', { authorization: `Bearer ${generateApiKey()}` }],
  ])('responde 401 %s', async (_name, headers) => {
    const res = await ctx.app.inject({ method: 'POST', url: '/uploads', payload: upload, headers });
    expect(res.statusCode).toBe(401);
    expect(res.headers['www-authenticate']).toBe('Bearer');
  });

  it('chave revogada para na hora', async () => {
    await ctx.apiKeys.delete(hashApiKey(ctx.keys.alice));
    const res = await ctx.app.inject({ method: 'POST', url: '/uploads', payload: upload, headers: ctx.as('alice') });
    expect(res.statusCode).toBe(401);
  });

  it('health e link público não pedem chave', async () => {
    expect((await ctx.app.inject({ url: '/health' })).statusCode).toBe(200);
    expect((await ctx.app.inject({ url: `/s/${'a'.repeat(43)}` })).statusCode).toBe(404);
  });

  it('rejeita antes de ler o corpo', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/uploads', payload: 'não é json' });
    expect(res.statusCode).toBe(401);
  });
});

describe('rate limit', () => {
  it('limita uploads por dono e devolve Retry-After', async () => {
    await ctx.app.close();
    ctx = await testApp({ RATE_LIMIT_UPLOADS_PER_HOUR: '2' });
    const send = (owner: 'alice' | 'bob') =>
      ctx.app.inject({ method: 'POST', url: '/uploads', payload: upload, headers: ctx.as(owner) });

    const first = await send('alice');
    expect(first.statusCode).toBe(201);
    expect(first.headers['ratelimit-remaining']).toBe('1');
    expect((await send('alice')).statusCode).toBe(201);

    const blocked = await send('alice');
    expect(blocked.statusCode).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);

    // O limite é de cada dono.
    expect((await send('bob')).statusCode).toBe(201);
  });

  it('limita o link público por IP', async () => {
    await ctx.app.close();
    ctx = await testApp({ RATE_LIMIT_DOWNLOADS_PER_MINUTE: '3' });
    const hit = (ip: string) => ctx.app.inject({ url: `/s/${'a'.repeat(43)}`, remoteAddress: ip });

    for (let i = 0; i < 3; i++) expect((await hit('10.0.0.1')).statusCode).toBe(404);
    expect((await hit('10.0.0.1')).statusCode).toBe(429);
    expect((await hit('10.0.0.2')).statusCode).toBe(404);
  });

  it('limita tentativas de autenticação com falha por IP', async () => {
    await ctx.app.close();
    ctx = await testApp({ RATE_LIMIT_AUTH_FAILURES_PER_MINUTE: '2' });
    const bad = () =>
      ctx.app.inject({ method: 'POST', url: '/uploads', payload: upload, remoteAddress: '10.0.0.9' });

    expect((await bad()).statusCode).toBe(401);
    expect((await bad()).statusCode).toBe(401);
    expect((await bad()).statusCode).toBe(429);
  });

  it('ignora X-Forwarded-For quando TRUST_PROXY é false', async () => {
    await ctx.app.close();
    ctx = await testApp({ RATE_LIMIT_DOWNLOADS_PER_MINUTE: '1' });
    const hit = (fakeIp: string) =>
      ctx.app.inject({ url: `/s/${'a'.repeat(43)}`, remoteAddress: '10.0.0.1', headers: { 'x-forwarded-for': fakeIp } });

    expect((await hit('1.1.1.1')).statusCode).toBe(404);
    expect((await hit('2.2.2.2')).statusCode).toBe(429);
  });
});
