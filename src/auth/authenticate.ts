import type { onRequestAsyncHookHandler } from 'fastify';
import { tooManyRequests } from '../rate-limit/hook.js';
import type { RateLimiter } from '../rate-limit/limiter.js';
import { hashApiKey, isApiKeyFormat } from './api-keys.js';
import type { ApiKeyRepository } from './repository.js';

declare module 'fastify' {
  interface FastifyRequest {
    ownerId: string;
  }
}

interface Options {
  apiKeys: ApiKeyRepository;
  limiter: RateLimiter;
  failuresPerMinute: number;
}

// Authorization: Bearer sf_...
// Não precisa de comparação em tempo constante: a chave nunca é comparada, só o hash dela
// é usado como chave de busca. Medir o tempo da busca não diz nada sobre a chave certa.
export function authenticate({ apiKeys, limiter, failuresPerMinute }: Options): onRequestAsyncHookHandler {
  return async (request, reply) => {
    const header = request.headers.authorization ?? '';
    const [scheme, key = ''] = header.split(' ');
    const record = scheme === 'Bearer' && isApiKeyFormat(key) ? await apiKeys.findByHash(hashApiKey(key)) : null;

    if (record) {
      request.ownerId = record.ownerId;
      request.log = request.log.child({ ownerId: record.ownerId });
      return;
    }

    // Força bruta numa chave de 256 bits não vai a lugar nenhum, mas não tem por que deixar
    // alguém martelar o banco de graça.
    const failures = await limiter.hit(`auth-failure:${request.ip}`, failuresPerMinute, 60);
    if (!failures.allowed) return tooManyRequests(reply, failures);

    return reply
      .code(401)
      .header('www-authenticate', 'Bearer')
      .send({ error: 'unauthorized', message: 'API key ausente ou inválida' });
  };
}
