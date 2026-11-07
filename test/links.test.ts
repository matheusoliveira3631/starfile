import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newFileId, storedKey } from '../src/files/ids.js';
import type { FileRecord } from '../src/files/repository.js';
import { testApp } from './helpers.js';

const HOUR = 3600;
let ctx: Awaited<ReturnType<typeof testApp>>;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-01-10T12:00:00Z'));
  ctx = await testApp();
});

afterEach(async () => {
  await ctx.app.close();
  vi.useRealTimers();
});

const now = () => Math.floor(Date.now() / 1000);

async function storedFile(overrides: Partial<FileRecord> = {}) {
  const id = newFileId();
  await ctx.files.create({
    id,
    ownerId: 'alice',
    filename: 'relatório final.pdf',
    contentType: 'application/pdf',
    size: 100,
    status: 'ready',
    createdAt: new Date().toISOString(),
    expiresAt: now() + 30 * 24 * HOUR,
    ...overrides,
  });
  return id;
}

interface CreatedLink {
  linkId: string;
  url: string;
  expiresAt: string;
  maxDownloads: number | null;
}

async function createLink(fileId: string, body?: object, owner: 'alice' | 'bob' = 'alice') {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/files/${fileId}/links`,
    headers: ctx.as(owner),
    ...(body && { payload: body }),
  });
  return { res, link: res.json<CreatedLink>() };
}

const open = (url: string) => ctx.app.inject({ method: 'GET', url: new URL(url).pathname });

describe('POST /files/:id/links', () => {
  it('cria link com validade padrão de 24h', async () => {
    const id = await storedFile();
    const { res, link } = await createLink(id);

    expect(res.statusCode).toBe(201);
    expect(link.url).toMatch(/^http:\/\/localhost:3000\/s\/[A-Za-z0-9_-]{43}$/);
    expect(link.expiresAt).toBe('2026-01-11T12:00:00.000Z');
    expect(link.maxDownloads).toBeNull();
  });

  it('guarda só o hash do token', async () => {
    const id = await storedFile();
    const { link } = await createLink(id);
    const token = link.url.split('/').pop() ?? '';
    const stored = ctx.links.records.get(link.linkId);

    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(token);
  });

  it('não deixa o link durar mais que o arquivo', async () => {
    const id = await storedFile({ expiresAt: now() + 2 * HOUR });
    const { link } = await createLink(id, { expiresInHours: 48 });
    expect(link.expiresAt).toBe('2026-01-10T14:00:00.000Z');
  });

  it('respeita LINK_MAX_TTL_HOURS', async () => {
    const id = await storedFile();
    const { res } = await createLink(id, { expiresInHours: 169 });
    expect(res.statusCode).toBe(400);
  });

  it.each(['pending', 'rejected'] as const)('recusa arquivo %s com 409', async (status) => {
    const id = await storedFile({ status });
    const { res } = await createLink(id);
    expect(res.statusCode).toBe(409);
  });

  it('responde 404 pra arquivo inexistente ou expirado', async () => {
    expect((await createLink(newFileId())).res.statusCode).toBe(404);
    const expired = await storedFile({ expiresAt: now() - 1 });
    expect((await createLink(expired)).res.statusCode).toBe(404);
  });
});

describe('GET /s/:token', () => {
  it('conta o download e redireciona pra URL assinada curta', async () => {
    const id = await storedFile();
    const { link } = await createLink(id);

    const res = await open(link.url);
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(
      `https://bucket.example/${storedKey(id)}?name=${encodeURIComponent('relatório final.pdf')}&expires=60`,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(ctx.links.records.get(link.linkId)?.downloads).toBe(1);
  });

  it('para de funcionar quando expira', async () => {
    const id = await storedFile();
    const { link } = await createLink(id, { expiresInHours: 1 });

    vi.setSystemTime(Date.now() + HOUR * 1000 + 1000);
    const res = await open(link.url);
    expect(res.statusCode).toBe(410);
  });

  it('para de funcionar quando atinge o limite de downloads', async () => {
    const id = await storedFile();
    const { link } = await createLink(id, { maxDownloads: 2 });

    expect((await open(link.url)).statusCode).toBe(302);
    expect((await open(link.url)).statusCode).toBe(302);
    expect((await open(link.url)).statusCode).toBe(410);
    expect(ctx.links.records.get(link.linkId)?.downloads).toBe(2);
  });

  it('não conta download se o arquivo expirou antes do link', async () => {
    const id = await storedFile();
    const { link } = await createLink(id);
    const file = ctx.files.records.get(id);
    if (file) file.expiresAt = now() - 1;

    expect((await open(link.url)).statusCode).toBe(410);
    expect(ctx.links.records.get(link.linkId)?.downloads).toBe(0);
  });

  it.each(['curto', 'x'.repeat(43), '../../etc/passwd'])('responde 404 pra token %s', async (token) => {
    const res = await ctx.app.inject({ method: 'GET', url: `/s/${encodeURIComponent(token)}` });
    expect(res.statusCode).toBe(404);
  });
});

describe('dono do arquivo', () => {
  it('outra pessoa não cria, não lista e não revoga links', async () => {
    const id = await storedFile();
    const { link } = await createLink(id);

    expect((await createLink(id, undefined, 'bob')).res.statusCode).toBe(404);
    const list = await ctx.app.inject({ method: 'GET', url: `/files/${id}/links`, headers: ctx.as('bob') });
    expect(list.statusCode).toBe(404);
    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/files/${id}/links/${link.linkId}`,
      headers: ctx.as('bob'),
    });
    expect(del.statusCode).toBe(404);
    expect((await open(link.url)).statusCode).toBe(302);
  });

  it('o link público funciona sem API key', async () => {
    const id = await storedFile();
    const { link } = await createLink(id);
    expect((await open(link.url)).statusCode).toBe(302);
  });
});

describe('listar e revogar', () => {
  it('lista os links sem token nem hash', async () => {
    const id = await storedFile();
    await createLink(id);
    await createLink(id, { maxDownloads: 1 });

    const res = await ctx.app.inject({ method: 'GET', url: `/files/${id}/links`, headers: ctx.as('alice') });
    const { links } = res.json<{ links: Record<string, unknown>[] }>();
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).not.toHaveProperty('tokenHash');
      expect(link).toMatchObject({ active: true, downloads: 0 });
    }
  });

  it('link revogado para na hora', async () => {
    const id = await storedFile();
    const { link } = await createLink(id);

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/files/${id}/links/${link.linkId}`,
      headers: ctx.as('alice'),
    });
    expect(del.statusCode).toBe(204);
    expect((await open(link.url)).statusCode).toBe(404);
  });

  it('não revoga link de outro arquivo', async () => {
    const a = await storedFile();
    const b = await storedFile();
    const { link } = await createLink(a);

    const del = await ctx.app.inject({
      method: 'DELETE',
      url: `/files/${b}/links/${link.linkId}`,
      headers: ctx.as('alice'),
    });
    expect(del.statusCode).toBe(404);
    expect((await open(link.url)).statusCode).toBe(302);
  });
});
