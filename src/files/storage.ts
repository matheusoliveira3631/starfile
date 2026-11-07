import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  type S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface UploadForm {
  url: string;
  fields: Record<string, string>;
}

export interface CreateUploadInput {
  key: string;
  contentType: string;
  size: number;
  expiresIn: number;
}

export interface DownloadUrlInput {
  key: string;
  filename: string;
  contentType: string;
  expiresIn: number;
}

export interface FileStorage {
  createUpload(input: CreateUploadInput): Promise<UploadForm>;
  downloadUrl(input: DownloadUrlInput): Promise<string>;
  head(key: string): Promise<{ size: number } | null>;
  readStart(key: string, bytes: number): Promise<Uint8Array>;
  move(from: string, to: string): Promise<void>;
  delete(key: string): Promise<void>;
}

export class S3FileStorage implements FileStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  // POST e não PUT: a URL de PUT assina só método e key, e o cliente manda o tamanho que quiser.
  // A policy do POST tem content-length-range, então o próprio S3 recusa arquivo fora do tamanho declarado.
  async createUpload({ key, contentType, size, expiresIn }: CreateUploadInput) {
    return createPresignedPost(this.client, {
      Bucket: this.bucket,
      Key: key,
      Expires: expiresIn,
      Fields: { 'Content-Type': contentType },
      Conditions: [
        ['content-length-range', size, size],
        ['eq', '$Content-Type', contentType],
      ],
    });
  }

  // Sempre "attachment": o navegador baixa em vez de abrir, então nem um arquivo
  // que passou na validação consegue rodar script no domínio do bucket.
  async downloadUrl({ key, filename, contentType, expiresIn }: DownloadUrlInput) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: contentDisposition(filename),
        ResponseContentType: contentType,
      }),
      { expiresIn },
    );
  }

  async head(key: string) {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0 };
    } catch (error) {
      if (error instanceof NotFound) return null;
      throw error;
    }
  }

  async readStart(key: string, bytes: number) {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${String(bytes - 1)}` }),
    );
    return res.Body ? res.Body.transformToByteArray() : new Uint8Array();
  }

  async move(from: string, to: string) {
    await this.client.send(new CopyObjectCommand({ Bucket: this.bucket, CopySource: `${this.bucket}/${from}`, Key: to }));
    await this.delete(from);
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

// filename= com fallback ASCII pra navegador velho, filename*= (RFC 5987) com o nome real em UTF-8.
export function contentDisposition(filename: string): string {
  const ascii = filename.normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/["\\]/g, '') || 'arquivo';
  const encoded = encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
