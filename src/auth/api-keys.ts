import { createHash, randomBytes } from 'node:crypto';

// 256 bits aleatórios com prefixo "sf_", no estilo das chaves do Stripe e do GitHub:
// o prefixo deixa a chave fácil de achar por secret scanning se alguém commitar sem querer.
export const generateApiKey = () => `sf_${randomBytes(32).toString('base64url')}`;

export const isApiKeyFormat = (value: string) => /^sf_[A-Za-z0-9_-]{43}$/.test(value);

// SHA-256 e não argon2/bcrypt de propósito. Hash lento existe pra senha, que tem pouca entropia
// e cai em ataque de dicionário. Uma chave de 256 bits aleatórios não tem dicionário, e hash
// rápido evita gastar 100 ms de CPU em toda requisição.
export const hashApiKey = (key: string) => createHash('sha256').update(key).digest('hex');

// O suficiente pra pessoa reconhecer qual chave é, sem revelar a chave.
export const apiKeyPrefix = (key: string) => key.slice(0, 11);

export const isOwnerId = (value: string) => /^[a-z0-9][a-z0-9-]{2,39}$/.test(value);
