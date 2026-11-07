import { afterEach, describe, expect, it } from 'vitest';
import { testApp } from './helpers.js';

let ctx = testApp();
afterEach(async () => {
  await ctx.app.close();
  ctx = testApp();
});

const post = (body: unknown) => ctx.app.inject({ method: 'POST', url: '/uploads', payload: body as object });

describe('POST /uploads', () => {
  it('registra o arquivo como pendente e devolve o formulário de upload', async () => {
    const res = await post({ filename: 'foto.png', contentType: 'image/png', size: 1234 });

    expect(res.statusCode).toBe(201);
    const body = res.json<{ fileId: string; upload: { url: string; fields: Record<string, string> } }>();
    expect(body.fileId).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(body.upload.fields.key).toBe(`pending/${body.fileId}`);

    expect(ctx.storage.uploads[0]).toEqual({
      key: `pending/${body.fileId}`,
      contentType: 'image/png',
      size: 1234,
      expiresIn: 300,
    });
    expect(ctx.files.records.get(body.fileId)).toMatchObject({ status: 'pending', filename: 'foto.png', size: 1234 });
  });

  it('gera ids diferentes a cada upload', async () => {
    const a = await post({ filename: 'a.txt', contentType: 'text/plain', size: 1 });
    const b = await post({ filename: 'a.txt', contentType: 'text/plain', size: 1 });
    expect(a.json<{ fileId: string }>().fileId).not.toBe(b.json<{ fileId: string }>().fileId);
  });

  it('limpa o nome do arquivo', async () => {
    const res = await post({ filename: '../../segredo.txt', contentType: 'text/plain', size: 10 });
    const { fileId } = res.json<{ fileId: string }>();
    expect(ctx.files.records.get(fileId)?.filename).toBe('segredo.txt');
  });

  it('recusa arquivo acima do limite com 413', async () => {
    const res = await post({ filename: 'grande.zip', contentType: 'application/zip', size: 25 * 1024 * 1024 + 1 });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ error: 'file_too_large' });
  });

  it('respeita MAX_UPLOAD_MB', async () => {
    await ctx.app.close();
    ctx = testApp({ MAX_UPLOAD_MB: '1' });
    const res = await post({ filename: 'a.zip', contentType: 'application/zip', size: 2 * 1024 * 1024 });
    expect(res.statusCode).toBe(413);
  });

  it('recusa tipo fora da lista com 415', async () => {
    const res = await post({ filename: 'app.exe', contentType: 'application/x-msdownload', size: 10 });
    expect(res.statusCode).toBe(415);
    expect(res.json()).toMatchObject({ error: 'unsupported_type' });
  });

  it('recusa extensão que não bate com o tipo', async () => {
    const res = await post({ filename: 'foto.exe', contentType: 'image/png', size: 10 });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'extension_mismatch' });
  });

  it.each([
    [{}],
    [{ filename: 'a.png', contentType: 'image/png', size: 0 }],
    [{ filename: 'a.png', contentType: 'image/png', size: 1.5 }],
    [{ filename: '', contentType: 'image/png', size: 1 }],
  ])('recusa corpo inválido %j', async (body) => {
    const res = await post(body);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'invalid_body' });
  });

  it('não grava nada quando recusa', async () => {
    await post({ filename: 'foto.exe', contentType: 'image/png', size: 10 });
    expect(ctx.files.records.size).toBe(0);
    expect(ctx.storage.uploads).toHaveLength(0);
  });
});

describe('GET /files/:id', () => {
  it('devolve o status e a data de expiração', async () => {
    const created = await post({ filename: 'a.pdf', contentType: 'application/pdf', size: 100 });
    const { fileId } = created.json<{ fileId: string }>();

    const res = await ctx.app.inject({ method: 'GET', url: `/files/${fileId}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: fileId, status: 'pending', filename: 'a.pdf' });
    expect(res.json<{ expiresAt: string }>().expiresAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it.each(['naoexiste000000000000000', '123', '..%2F..%2Fetc'])('responde 404 para %s', async (id) => {
    const res = await ctx.app.inject({ method: 'GET', url: `/files/${id}` });
    expect(res.statusCode).toBe(404);
  });
});
