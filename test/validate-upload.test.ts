import { pino } from 'pino';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AllowedType } from '../src/files/file-types.js';
import { newFileId, pendingKey, storedKey } from '../src/files/ids.js';
import { validateUpload } from '../src/files/validate-upload.js';
import { InMemoryFiles, InMemoryStorage } from './fakes.js';
import { EXE, PDF, PNG, TEXT } from './samples.js';

let files: InMemoryFiles;
let storage: InMemoryStorage;
const log = pino({ level: 'silent' });
const run = (key: string) => validateUpload(key, { files, storage, log, retentionSeconds: 3600 });

beforeEach(() => {
  files = new InMemoryFiles();
  storage = new InMemoryStorage();
});

async function uploaded(contentType: AllowedType, bytes: Uint8Array, declaredSize = bytes.byteLength) {
  const id = newFileId();
  await files.create({
    id,
    ownerId: 'alice',
    filename: 'arquivo',
    contentType,
    size: declaredSize,
    status: 'pending',
    createdAt: new Date().toISOString(),
    expiresAt: 1,
  });
  storage.objects.set(pendingKey(id), bytes);
  return id;
}

describe('validateUpload', () => {
  it.each([
    ['image/png', PNG],
    ['application/pdf', PDF],
    ['text/plain', TEXT],
  ] as const)('aprova %s com conteúdo correspondente', async (type, bytes) => {
    const id = await uploaded(type, bytes);

    expect(await run(pendingKey(id))).toEqual({ outcome: 'ready', id });
    expect(storage.objects.has(pendingKey(id))).toBe(false);
    expect(storage.objects.get(storedKey(id))).toEqual(bytes);
    const record = files.records.get(id);
    expect(record?.status).toBe('ready');
    expect(record?.expiresAt).toBeCloseTo(Date.now() / 1000 + 3600, -1);
  });

  it('rejeita executável declarado como PNG', async () => {
    const id = await uploaded('image/png', EXE);

    expect(await run(pendingKey(id))).toEqual({ outcome: 'rejected', id, reason: 'type_mismatch' });
    expect(storage.objects.size).toBe(0);
    expect(files.records.get(id)).toMatchObject({ status: 'rejected', rejectReason: 'type_mismatch' });
  });

  it('rejeita PDF declarado como imagem', async () => {
    const id = await uploaded('image/jpeg', PDF);
    expect(await run(pendingKey(id))).toMatchObject({ outcome: 'rejected', reason: 'type_mismatch' });
  });

  it('rejeita binário declarado como texto', async () => {
    const id = await uploaded('text/plain', PNG);
    expect(await run(pendingKey(id))).toMatchObject({ outcome: 'rejected', reason: 'not_text' });
  });

  it('rejeita texto que não é UTF-8', async () => {
    const id = await uploaded('text/plain', Uint8Array.from([0x6f, 0x6c, 0xe1, 0x21]));
    expect(await run(pendingKey(id))).toMatchObject({ outcome: 'rejected', reason: 'not_text' });
  });

  it('rejeita tamanho diferente do declarado', async () => {
    const id = await uploaded('image/png', PNG, PNG.byteLength + 10);
    expect(await run(pendingKey(id))).toMatchObject({ outcome: 'rejected', reason: 'size_mismatch' });
    expect(storage.objects.size).toBe(0);
  });

  it('apaga objeto sem registro no banco', async () => {
    const key = pendingKey(newFileId());
    storage.objects.set(key, PNG);

    expect(await run(key)).toEqual({ outcome: 'ignored', reason: 'unknown_file' });
    expect(storage.objects.size).toBe(0);
  });

  it('apaga objeto com key fora do padrão', async () => {
    storage.objects.set('pending/../files/x', PNG);
    expect(await run('pending/../files/x')).toEqual({ outcome: 'ignored', reason: 'invalid_key' });
    expect(storage.objects.size).toBe(0);
  });

  it('é idempotente quando o S3 entrega o evento duas vezes', async () => {
    const id = await uploaded('image/png', PNG);
    await run(pendingKey(id));

    expect(await run(pendingKey(id))).toEqual({ outcome: 'ignored', reason: 'already_processed' });
    expect(storage.objects.get(storedKey(id))).toEqual(PNG);
    expect(files.records.get(id)?.status).toBe('ready');
  });
});
