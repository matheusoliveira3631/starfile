import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hashApiKey } from '../../src/auth/api-keys.js';
import { integrationContext } from './context.js';

let ctx: Awaited<ReturnType<typeof integrationContext>>;
beforeAll(async () => {
  ctx = await integrationContext({ RATE_LIMIT_UPLOADS_PER_HOUR: '5' });
});
afterAll(() => ctx.app.close());

const upload = { filename: 'a.txt', contentType: 'text/plain', size: 5 };

describe('auth e rate limit no DynamoDB', () => {
  it('20 uploads simultâneos com limite de 5: passam exatamente 5', async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        ctx.app.inject({ method: 'POST', url: '/uploads', payload: upload, headers: ctx.auth }),
      ),
    );
    const statuses = results.map((r) => r.statusCode);

    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 429)).toHaveLength(15);
    expect(Number(results.find((r) => r.statusCode === 429)?.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('chave revogada para na requisição seguinte', async () => {
    expect(await ctx.deps.apiKeys.delete(hashApiKey(ctx.key))).toBe(true);
    const res = await ctx.app.inject({ url: '/files/xxxxxxxxxxxxxxxxxxxxxx', headers: ctx.auth });
    expect(res.statusCode).toBe(401);
  });
});
