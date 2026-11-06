import { fileTypeFromBuffer } from 'file-type';
import type { Logger } from 'pino';
import { ALLOWED_TYPES, type AllowedType } from './file-types.js';
import { idFromPendingKey, storedKey } from './ids.js';
import type { FileRepository } from './repository.js';
import type { FileStorage } from './storage.js';

// Suficiente para o file-type reconhecer todos os formatos aceitos.
const SNIFF_BYTES = 4100;

export type ValidationResult =
  | { outcome: 'ready'; id: string }
  | { outcome: 'rejected'; id: string; reason: string }
  | { outcome: 'ignored'; reason: string };

interface Deps {
  files: FileRepository;
  storage: FileStorage;
  log: Logger;
}

// O Content-Type do upload é o que o cliente declarou, então não prova nada.
// Aqui o arquivo já está no S3 (em pending/) e a gente confere o conteúdo de verdade.
export async function validateUpload(key: string, { files, storage, log }: Deps): Promise<ValidationResult> {
  const id = idFromPendingKey(key);
  if (!id) {
    await storage.delete(key);
    log.warn({ key }, 'objeto fora do padrão em pending/, removido');
    return { outcome: 'ignored', reason: 'invalid_key' };
  }

  const record = await files.get(id);
  if (record?.status !== 'pending') {
    // Sem registro ou já processado (o S3 pode entregar o mesmo evento mais de uma vez).
    await storage.delete(key);
    return { outcome: 'ignored', reason: record ? 'already_processed' : 'unknown_file' };
  }

  const object = await storage.head(key);
  if (!object) return { outcome: 'ignored', reason: 'object_missing' };

  const reason =
    object.size !== record.size
      ? 'size_mismatch'
      : await contentMismatch(await storage.readStart(key, SNIFF_BYTES), record.contentType);

  if (reason) {
    await storage.delete(key);
    await files.markRejected(id, reason);
    log.info({ fileId: id, reason }, 'upload rejeitado');
    return { outcome: 'rejected', id, reason };
  }

  await storage.move(key, storedKey(id));
  await files.markReady(id);
  log.info({ fileId: id }, 'upload validado');
  return { outcome: 'ready', id };
}

async function contentMismatch(bytes: Uint8Array, declared: AllowedType): Promise<string | null> {
  if (ALLOWED_TYPES[declared].kind === 'text') {
    return looksLikeText(bytes) ? null : 'not_text';
  }
  const detected = await fileTypeFromBuffer(bytes);
  return detected?.mime === declared ? null : 'type_mismatch';
}

function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    // stream: true para não reclamar de um caractere cortado no fim do trecho lido.
    new TextDecoder('utf-8', { fatal: true }).decode(bytes, { stream: true });
    return true;
  } catch {
    return false;
  }
}
