import type { FastifyPluginAsync, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { Config } from '../config.js';
import { isFileId, storedKey } from '../files/ids.js';
import type { FileRepository } from '../files/repository.js';
import type { FileStorage } from '../files/storage.js';
import type { LinkRecord, LinkRepository } from '../links/repository.js';
import { hashLinkToken, isLinkId, isLinkToken, newLinkId, newLinkToken } from '../links/tokens.js';

interface Options {
  config: Config;
  files: FileRepository;
  links: LinkRepository;
  storage: FileStorage;
}

const nowSeconds = () => Math.floor(Date.now() / 1000);
const iso = (epochSeconds: number) => new Date(epochSeconds * 1000).toISOString();

const notFound = (reply: FastifyReply, message = 'Arquivo não encontrado') =>
  reply.code(404).send({ error: 'not_found', message });

function publicLink(link: LinkRecord, now: number) {
  const exhausted = link.maxDownloads !== undefined && link.downloads >= link.maxDownloads;
  return {
    linkId: link.linkId,
    createdAt: link.createdAt,
    expiresAt: iso(link.expiresAt),
    maxDownloads: link.maxDownloads ?? null,
    downloads: link.downloads,
    active: link.expiresAt > now && !exhausted,
  };
}

export const linkRoutes: FastifyPluginAsync<Options> = async (app, { config, files, links, storage }) => {
  const createBody = z
    .object({
      expiresInHours: z.number().int().min(1).max(config.LINK_MAX_TTL_HOURS).default(24),
      maxDownloads: z.number().int().min(1).max(10_000).optional(),
    })
    .default({ expiresInHours: 24 });

  app.post<{ Params: { id: string } }>('/files/:id/links', async (request, reply) => {
    const { id } = request.params;
    const parsed = createBody.safeParse(request.body ?? undefined);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_body', message: z.prettifyError(parsed.error) });
    }

    const file = isFileId(id) ? await files.get(id) : null;
    const now = nowSeconds();
    if (!file || file.expiresAt <= now) return notFound(reply);
    if (file.status !== 'ready') {
      return reply.code(409).send({ error: 'file_not_ready', message: `O arquivo está ${file.status}` });
    }

    const token = newLinkToken();
    const link: LinkRecord = {
      linkId: newLinkId(),
      fileId: id,
      tokenHash: hashLinkToken(token),
      createdAt: new Date(now * 1000).toISOString(),
      // Link não sobrevive ao arquivo.
      expiresAt: Math.min(now + parsed.data.expiresInHours * 3600, file.expiresAt),
      downloads: 0,
      ...(parsed.data.maxDownloads !== undefined && { maxDownloads: parsed.data.maxDownloads }),
    };
    await links.create(link);

    return reply.code(201).send({ ...publicLink(link, now), url: new URL(`/s/${token}`, config.PUBLIC_BASE_URL).href });
  });

  app.get<{ Params: { id: string } }>('/files/:id/links', async (request, reply) => {
    const { id } = request.params;
    const file = isFileId(id) ? await files.get(id) : null;
    if (!file) return notFound(reply);
    const now = nowSeconds();
    const items = await links.listByFile(id);
    return { links: items.map((link) => publicLink(link, now)) };
  });

  app.delete<{ Params: { id: string; linkId: string } }>('/files/:id/links/:linkId', async (request, reply) => {
    const { id, linkId } = request.params;
    const deleted = isFileId(id) && isLinkId(linkId) && (await links.delete(id, linkId));
    if (!deleted) return notFound(reply, 'Link não encontrado');
    return reply.code(204).send();
  });

  // O link público. Não entrega o arquivo: confere o token, conta o download e
  // redireciona pra uma URL assinada do S3 que vale só alguns segundos.
  app.get<{ Params: { token: string } }>('/s/:token', async (request, reply) => {
    void reply.header('cache-control', 'no-store').header('referrer-policy', 'no-referrer');

    const { token } = request.params;
    const link = isLinkToken(token) ? await links.findByTokenHash(hashLinkToken(token)) : null;
    if (!link) return notFound(reply, 'Link não encontrado');

    const now = nowSeconds();
    const file = await files.get(link.fileId);
    const fileAvailable = file?.status === 'ready' && file.expiresAt > now;

    if (!file || !fileAvailable || !(await links.consume(link.fileId, link.linkId, now))) {
      return reply.code(410).send({ error: 'link_unavailable', message: 'Link expirado, revogado ou esgotado' });
    }

    const url = await storage.downloadUrl({
      key: storedKey(file.id),
      filename: file.filename,
      contentType: file.contentType,
      expiresIn: config.DOWNLOAD_URL_TTL_SECONDS,
    });
    return reply.redirect(url, 302);
  });
};
