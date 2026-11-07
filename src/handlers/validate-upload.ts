import type { S3Event } from 'aws-lambda';
import { pino } from 'pino';
import { defaultDeps } from '../app.js';
import { fileRetentionSeconds, loadConfig } from '../config.js';
import { validateUpload } from '../files/validate-upload.js';

const config = loadConfig();
const deps = defaultDeps(config);
const log = pino({ level: config.LOG_LEVEL });

// Disparado pelo evento ObjectCreated do S3 no prefixo pending/.
// Se der erro inesperado, a exceção sobe e o Lambda tenta de novo.
export async function handler(event: S3Event) {
  for (const record of event.Records) {
    // As keys chegam URL-encoded, com espaço virando "+".
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    await validateUpload(key, { ...deps, log, retentionSeconds: fileRetentionSeconds(config) });
  }
}
