// Tipos aceitos e as extensões que cada um pode ter.
// "binary" é conferido pelos magic bytes depois do upload; "text" não tem assinatura,
// então a checagem é ser UTF-8 válido e não ter byte nulo.
export const ALLOWED_TYPES = {
  'image/png': { extensions: ['png'], kind: 'binary' },
  'image/jpeg': { extensions: ['jpg', 'jpeg'], kind: 'binary' },
  'image/gif': { extensions: ['gif'], kind: 'binary' },
  'image/webp': { extensions: ['webp'], kind: 'binary' },
  'application/pdf': { extensions: ['pdf'], kind: 'binary' },
  'application/zip': { extensions: ['zip'], kind: 'binary' },
  'text/plain': { extensions: ['txt', 'md', 'csv', 'log'], kind: 'text' },
} as const satisfies Record<string, { extensions: readonly string[]; kind: 'binary' | 'text' }>;

export type AllowedType = keyof typeof ALLOWED_TYPES;

export const allowedTypes = Object.keys(ALLOWED_TYPES) as [AllowedType, ...AllowedType[]];

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

export function extensionMatches(filename: string, type: AllowedType): boolean {
  const ext = extensionOf(filename);
  return (ALLOWED_TYPES[type].extensions as readonly string[]).includes(ext);
}

// O nome só é usado no Content-Disposition do download, nunca como caminho.
// Mesmo assim, tira diretório, caracteres de controle e o que quebraria o header.
export function sanitizeFilename(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim();
  return clean.slice(-255);
}
