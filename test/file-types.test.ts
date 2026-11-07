import { describe, expect, it } from 'vitest';
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
