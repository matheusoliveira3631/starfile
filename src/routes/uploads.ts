import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { maxUploadBytes, type Config } from '../config.js';
import { allowedTypes, extensionMatches, sanitizeFilename } from '../files/file-types.js';
import { isFileId, newFileId, pendingKey } from '../files/ids.js';
import type { FileRepository } from '../files/repository.js';
import type { FileStorage } from '../files/storage.js';

// Registro pendente que nunca recebeu o arquivo expira em 1 dia.
const PENDING_TTL_SECONDS = 24 * 60 * 60;

const uploadBody = z.object({
  filename: z.string().trim().min(1).max(255),
  contentType: z.string(),
  size: z.number().int().positive(),
});

interface Options {
  config: Config;
  files: FileRepository;
  storage: FileStorage;
}

export const uploadRoutes: FastifyPluginAsync<Options> = async (app, { config, files, storage }) => {
  const maxBytes = maxUploadBytes(config);

  app.post('/uploads', async (request, reply) => {
    const parsed = uploadBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', message: z.prettifyError(parsed.error) });
    }
    const { size } = parsed.data;
    const filename = sanitizeFilename(parsed.data.filename);
    const contentType = z.enum(allowedTypes).safeParse(parsed.data.contentType);

    if (size > maxBytes) {
      return reply.code(413).send({ error: 'file_too_large', message: `Limite de ${String(config.MAX_UPLOAD_MB)} MB` });
    }
    if (!contentType.success) {
      return reply.code(415).send({ error: 'unsupported_type', message: `Tipos aceitos: ${allowedTypes.join(', ')}` });
    }
    if (!filename || !extensionMatches(filename, contentType.data)) {
      return reply.code(400).send({ error: 'extension_mismatch', message: 'A extensão não bate com o tipo do arquivo' });
    }

    const id = newFileId();
    const now = Date.now();
    await files.create({
      id,
      filename,
      contentType: contentType.data,
      size,
      status: 'pending',
      createdAt: new Date(now).toISOString(),
      expiresAt: Math.floor(now / 1000) + PENDING_TTL_SECONDS,
    });

    const upload = await storage.createUpload({
      key: pendingKey(id),
      contentType: contentType.data,
      size,
      expiresIn: config.UPLOAD_URL_TTL_SECONDS,
    });

    return reply.code(201).send({
      fileId: id,
      upload,
      uploadExpiresAt: new Date(now + config.UPLOAD_URL_TTL_SECONDS * 1000).toISOString(),
    });
  });

  app.get<{ Params: { id: string } }>('/files/:id', async (request, reply) => {
    const { id } = request.params;
    const record = isFileId(id) ? await files.get(id) : null;
    if (!record) {
      return reply.code(404).send({ error: 'not_found', message: 'Arquivo não encontrado' });
    }
    const { expiresAt: _expiresAt, ...publicFields } = record;
    return publicFields;
  });
};
