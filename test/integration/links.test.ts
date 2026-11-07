import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PDF } from '../samples.js';
import { integrationContext, s3ErrorCode, sendToS3, type UploadForm } from './context.js';

let ctx: Awaited<ReturnType<typeof integrationContext>>;
let fileId: string;

beforeAll(async () => {
  ctx = await integrationContext();
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/uploads',
    payload: { filename: 'relatório final.pdf', contentType: 'application/pdf', size: PDF.byteLength },
    headers: ctx.auth,
  });
  const body = res.json<{ fileId: string; upload: UploadForm }>();
  fileId = body.fileId;
  await sendToS3(body.upload, PDF);
  await ctx.validate(fileId);
});
afterAll(() => ctx.app.close());

async function createLink(body: object = {}) {
  const res = await ctx.app.inject({ method: 'POST', url: `/files/${fileId}/links`, payload: body, headers: ctx.auth });
  expect(res.statusCode).toBe(201);
  const link = res.json<{ linkId: string; url: string }>();
  return { ...link, path: new URL(link.url).pathname };
}

describe('links de compartilhamento', () => {
  it('redireciona pro S3 e o download traz o arquivo certo, com o nome certo', async () => {
    const { path } = await createLink();
    const res = await ctx.app.inject({ url: path });
    expect(res.statusCode).toBe(302);

    const download = await fetch(String(res.headers.location));
    expect(download.status).toBe(200);
    expect(new Uint8Array(await download.arrayBuffer())).toEqual(PDF);
    expect(download.headers.get('content-disposition')).toBe(
      `attachment; filename="relatorio final.pdf"; filename*=UTF-8''relat%C3%B3rio%20final.pdf`,
    );
  });

  it('com limite de 1 download e 20 acessos simultâneos, passa exatamente 1', async () => {
    const { path } = await createLink({ maxDownloads: 1 });
    const results = await Promise.all(Array.from({ length: 20 }, () => ctx.app.inject({ url: path })));
    const statuses = results.map((r) => r.statusCode);

    expect(statuses.filter((s) => s === 302)).toHaveLength(1);
    expect(statuses.filter((s) => s === 410)).toHaveLength(19);
  });

  it('link revogado para na hora', async () => {
    const { path, linkId } = await createLink();
    const del = await ctx.app.inject({ method: 'DELETE', url: `/files/${fileId}/links/${linkId}`, headers: ctx.auth });
    expect(del.statusCode).toBe(204);
    expect((await ctx.app.inject({ url: path })).statusCode).toBe(404);
  });

  // Precisa do LocalStack com S3_SKIP_SIGNATURE_VALIDATION=0, senão ele aceita qualquer assinatura.
  it('a URL do S3 expira e não aceita parâmetro adulterado', { timeout: 15_000 }, async () => {
    const url = await ctx.deps.storage.downloadUrl({
      key: `files/${fileId}`,
      filename: 'x.pdf',
      contentType: 'application/pdf',
      expiresIn: 3,
    });

    // Sem esta checagem, os 403 abaixo passariam por qualquer motivo, até credencial errada.
    expect((await fetch(url)).status).toBe(200);

    const tampered = new URL(url);
    tampered.searchParams.set('response-content-disposition', 'inline');
    const adulterated = await fetch(tampered);
    expect(adulterated.status).toBe(403);
    expect(await s3ErrorCode(adulterated)).toBe('SignatureDoesNotMatch');

    await new Promise((resolve) => setTimeout(resolve, 4500));
    const expired = await fetch(url);
    expect(expired.status).toBe(403);
  });
});
