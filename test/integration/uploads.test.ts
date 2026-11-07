import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXE, PNG } from '../samples.js';
import { integrationContext, sendToS3, type UploadForm } from './context.js';

let ctx: Awaited<ReturnType<typeof integrationContext>>;
beforeAll(async () => {
  ctx = await integrationContext();
});
afterAll(() => ctx.app.close());

async function requestUpload(bytes: Uint8Array, contentType = 'image/png', filename = 'foto.png') {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/uploads',
    payload: { filename, contentType, size: bytes.byteLength },
    headers: ctx.auth,
  });
  expect(res.statusCode).toBe(201);
  return res.json<{ fileId: string; upload: UploadForm }>();
}

describe('upload direto pro S3', () => {
  it('aceita o arquivo declarado e a validação aprova', async () => {
    const { fileId, upload } = await requestUpload(PNG);

    expect(await sendToS3(upload, PNG)).toEqual({ status: 204, code: null });
    expect(await ctx.validate(fileId)).toEqual({ outcome: 'ready', id: fileId });

    const res = await ctx.app.inject({ url: `/files/${fileId}`, headers: ctx.auth });
    expect(res.json()).toMatchObject({ status: 'ready' });
  });

  // Estes três são o motivo de usar presigned POST: quem recusa é o próprio S3.
  it('o S3 recusa arquivo maior que o declarado', async () => {
    const { upload } = await requestUpload(PNG);
    expect(await sendToS3(upload, new Uint8Array(PNG.byteLength + 1000))).toEqual({
      status: 400,
      code: 'EntityTooLarge',
    });
  });

  it('o S3 recusa Content-Type diferente do declarado', async () => {
    const { upload } = await requestUpload(PNG);
    expect(await sendToS3(upload, PNG, { 'Content-Type': 'text/html' })).toMatchObject({ status: 403 });
  });

  it('o S3 recusa gravar em outra key', async () => {
    const { upload } = await requestUpload(PNG);
    expect(await sendToS3(upload, PNG, { key: 'files/qualquer-coisa' })).toMatchObject({ status: 403 });
  });

  it('a validação rejeita executável com tamanho e tipo declarados certinho', async () => {
    const { fileId, upload } = await requestUpload(EXE);

    expect((await sendToS3(upload, EXE)).status).toBe(204);
    expect(await ctx.validate(fileId)).toMatchObject({ outcome: 'rejected', reason: 'type_mismatch' });
    expect(await ctx.deps.storage.head(`pending/${fileId}`)).toBeNull();
  });

  it('evento repetido não dá erro', async () => {
    const { fileId, upload } = await requestUpload(PNG);
    await sendToS3(upload, PNG);
    await ctx.validate(fileId);

    expect(await ctx.validate(fileId)).toEqual({ outcome: 'ignored', reason: 'already_processed' });
  });
});
