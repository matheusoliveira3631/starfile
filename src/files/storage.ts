import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  type S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

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

export interface FileStorage {
  createUpload(input: CreateUploadInput): Promise<UploadForm>;
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
