import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  AWS_REGION: z.string().min(1).default('us-east-1'),
  // Só para desenvolvimento e testes com LocalStack. Em produção fica vazio.
  AWS_ENDPOINT_URL: z.url().optional(),
  BUCKET_NAME: z.string().min(1),
  TABLE_NAME: z.string().min(1),

  MAX_UPLOAD_MB: z.coerce.number().int().positive().max(5120).default(25),
  UPLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),

  // Base dos links públicos (/s/:token). Em produção, o domínio da API.
  PUBLIC_BASE_URL: z.url().default('http://localhost:3000'),
  FILE_RETENTION_DAYS: z.coerce.number().int().positive().max(365).default(30),
  LINK_MAX_TTL_HOURS: z.coerce.number().int().positive().default(168),
  // Vida da URL assinada do S3 depois do redirect. Curta de propósito: quem tem o link
  // pede outra, e uma URL vazada em log ou histórico morre logo.
  DOWNLOAD_URL_TTL_SECONDS: z.coerce.number().int().min(10).max(600).default(60),

  // Atrás do API Gateway o IP real vem no X-Forwarded-For. Rodando direto, deixe false,
  // senão qualquer um escolhe o próprio IP mandando o header e fura o rate limit.
  TRUST_PROXY: z.stringbool().default(false),
  RATE_LIMIT_API_PER_MINUTE: z.coerce.number().int().positive().default(300),
  RATE_LIMIT_UPLOADS_PER_HOUR: z.coerce.number().int().positive().default(50),
  RATE_LIMIT_DOWNLOADS_PER_MINUTE: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_AUTH_FAILURES_PER_MINUTE: z.coerce.number().int().positive().default(20),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Variáveis de ambiente inválidas:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export const maxUploadBytes = (config: Config) => config.MAX_UPLOAD_MB * 1024 * 1024;
export const fileRetentionSeconds = (config: Config) => config.FILE_RETENTION_DAYS * 24 * 60 * 60;
