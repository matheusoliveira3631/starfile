import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { createAwsClients } from './aws.js';
import { loadConfig, type Config } from './config.js';
import { DynamoFileRepository, type FileRepository } from './files/repository.js';
import { S3FileStorage, type FileStorage } from './files/storage.js';
import { DynamoLinkRepository, type LinkRepository } from './links/repository.js';
import { loggerOptions } from './logger.js';
import { healthRoutes } from './routes/health.js';
import { linkRoutes } from './routes/links.js';
import { uploadRoutes } from './routes/uploads.js';

export interface AppDeps {
  files: FileRepository;
  links: LinkRepository;
  storage: FileStorage;
}

export function defaultDeps(config: Config): AppDeps {
  const { s3, dynamo } = createAwsClients(config);
  return {
    files: new DynamoFileRepository(dynamo, config.TABLE_NAME),
    links: new DynamoLinkRepository(dynamo, config.TABLE_NAME),
    storage: new S3FileStorage(s3, config.BUCKET_NAME),
  };
}

export function buildApp(config: Config = loadConfig(), deps: AppDeps = defaultDeps(config)): FastifyInstance {
  const app = Fastify({
    logger: loggerOptions(config),
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    // O arquivo nunca passa pela API, só o JSON pedindo a URL de upload.
    bodyLimit: 16 * 1024,
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
  void app.register(uploadRoutes, { config, ...deps });
  void app.register(linkRoutes, { config, ...deps });

  return app;
}
