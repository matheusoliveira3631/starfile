import { randomBytes } from 'node:crypto';

// 128 bits de crypto.randomBytes. A v1 usava random.randint com 10 dígitos.
export const newFileId = () => randomBytes(16).toString('base64url');

export const isFileId = (value: string) => /^[A-Za-z0-9_-]{22}$/.test(value);

export const pendingKey = (id: string) => `pending/${id}`;
export const storedKey = (id: string) => `files/${id}`;

export function idFromPendingKey(key: string): string | null {
  const match = /^pending\/([A-Za-z0-9_-]{22})$/.exec(key);
  return match?.[1] ?? null;
}
