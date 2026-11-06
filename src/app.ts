import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { loadConfig, type Config } from './config.js';
import { loggerOptions } from './logger.js';
import { healthRoutes } from './routes/health.js';

export function buildApp(config: Config = loadConfig()): FastifyInstance {
  const app = Fastify({
    logger: loggerOptions(config),
    genReqId: () => randomUUID(),
    requestIdHeader: false,
  });

  app.addHook('onSend', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.code(404).send({ error: 'not_found', message: `Rota ${request.method} ${request.url} não existe` });
  });

  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error({ err: error }, 'erro não tratado');
      return reply.code(500).send({ error: 'internal_error', message: 'Erro interno', requestId: request.id });
    }
    return reply.code(statusCode).send({ error: error.code, message: error.message });
  });

  void app.register(healthRoutes);

  return app;
}
