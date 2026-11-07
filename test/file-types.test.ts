import { describe, expect, it } from 'vitest';
import { contentDisposition } from '../src/files/storage.js';
import { extensionMatches, sanitizeFilename } from '../src/files/file-types.js';

describe('sanitizeFilename', () => {
  it('remove diretórios', () => {
    expect(sanitizeFilename('../../etc/passwd')).toBe('passwd');
    expect(sanitizeFilename('C:\\Users\\fulano\\foto.png')).toBe('foto.png');
  });

  it('remove caracteres de controle e aspas', () => {
    expect(sanitizeFilename('a"b\r\nc.txt')).toBe('abc.txt');
  });

  it('mantém acentos e espaços', () => {
    expect(sanitizeFilename('relatório final.pdf')).toBe('relatório final.pdf');
  });
});

describe('extensionMatches', () => {
  it('aceita a extensão do tipo, sem diferenciar maiúscula', () => {
    expect(extensionMatches('foto.JPG', 'image/jpeg')).toBe(true);
    expect(extensionMatches('foto.jpeg', 'image/jpeg')).toBe(true);
  });

  it('recusa extensão de outro tipo ou ausente', () => {
    expect(extensionMatches('script.exe', 'image/png')).toBe(false);
    expect(extensionMatches('foto.png.exe', 'image/png')).toBe(false);
    expect(extensionMatches('png', 'image/png')).toBe(false);
  });
});

describe('contentDisposition', () => {
  it('força download e preserva o nome em UTF-8', () => {
    expect(contentDisposition('relatório (final).pdf')).toBe(
      `attachment; filename="relatorio (final).pdf"; filename*=UTF-8''relat%C3%B3rio%20%28final%29.pdf`,
    );
  });

  it('usa fallback quando o nome não tem nada ASCII', () => {
    expect(contentDisposition('日本.txt')).toMatch(/^attachment; filename="\.txt"/);
    expect(contentDisposition('日本')).toMatch(/^attachment; filename="arquivo"/);
  });
});
