import { createHash, randomBytes } from 'node:crypto';

// O token só existe na URL entregue pra quem criou o link. No banco fica o hash,
// então um dump da tabela não dá acesso a nenhum arquivo.
export const newLinkToken = () => randomBytes(32).toString('base64url');

export const isLinkToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

export const hashLinkToken = (token: string) => createHash('sha256').update(token).digest('hex');

export const newLinkId = () => randomBytes(9).toString('base64url');

export const isLinkId = (value: string) => /^[A-Za-z0-9_-]{12}$/.test(value);
