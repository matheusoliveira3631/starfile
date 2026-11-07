import type { FastifyServerOptions } from 'fastify';

type LoggerOptions = Exclude<FastifyServerOptions['logger'], boolean | undefined>;
import type { Config } from './config.js';

// A v1 logava todos os headers de cada requisição, cookies e tokens inclusos.
// Aqui só sai método, url e status; e se algum header sensível escapar, o pino troca por [redacted].
export function loggerOptions(config: Config): LoggerOptions {
  return {
    level: config.LOG_LEVEL,
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        'res.headers["set-cookie"]',
      ],
      censor: '[redacted]',
    },
    ...(config.NODE_ENV === 'development' && {
      transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } },
    }),
  };
}
