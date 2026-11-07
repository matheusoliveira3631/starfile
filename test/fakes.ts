import type { FileRecord, FileRepository } from '../src/files/repository.js';
import type { CreateUploadInput, DownloadUrlInput, FileStorage } from '../src/files/storage.js';
import type { LinkRecord, LinkRepository } from '../src/links/repository.js';

export class InMemoryFiles implements FileRepository {
  readonly records = new Map<string, FileRecord>();

  async create(record: FileRecord) {
    if (this.records.has(record.id)) throw new Error('duplicado');
    this.records.set(record.id, { ...record });
  }

  async get(id: string) {
    const record = this.records.get(id);
    return record ? { ...record } : null;
  }

  async markReady(id: string, expiresAt: number) {
    return this.transition(id, (r) => {
      r.status = 'ready';
      r.expiresAt = expiresAt;
    });
  }

  async markRejected(id: string, reason: string) {
    return this.transition(id, (r) => {
      r.status = 'rejected';
      r.rejectReason = reason;
    });
  }

  private transition(id: string, apply: (r: FileRecord) => void) {
    const record = this.records.get(id);
    if (record?.status !== 'pending') return false;
    apply(record);
    return true;
  }
}

export class InMemoryStorage implements FileStorage {
  readonly objects = new Map<string, Uint8Array>();
  readonly uploads: CreateUploadInput[] = [];

  async createUpload(input: CreateUploadInput) {
    this.uploads.push(input);
    return { url: 'https://bucket.example/', fields: { key: input.key, 'Content-Type': input.contentType } };
  }

  async downloadUrl({ key, filename, expiresIn }: DownloadUrlInput) {
    return `https://bucket.example/${key}?name=${encodeURIComponent(filename)}&expires=${String(expiresIn)}`;
  }

  async head(key: string) {
    const object = this.objects.get(key);
    return object ? { size: object.byteLength } : null;
  }

  async readStart(key: string, bytes: number) {
    return (this.objects.get(key) ?? new Uint8Array()).slice(0, bytes);
  }

  async move(from: string, to: string) {
    const object = this.objects.get(from);
    if (!object) throw new Error(`não existe: ${from}`);
    this.objects.set(to, object);
    this.objects.delete(from);
  }

  async delete(key: string) {
    this.objects.delete(key);
  }
}

export class InMemoryLinks implements LinkRepository {
  readonly records = new Map<string, LinkRecord>();

  async create(link: LinkRecord) {
    this.records.set(link.linkId, { ...link });
  }

  async findByTokenHash(tokenHash: string) {
    const link = [...this.records.values()].find((l) => l.tokenHash === tokenHash);
    return link ? { ...link } : null;
  }

  async listByFile(fileId: string) {
    return [...this.records.values()].filter((l) => l.fileId === fileId).map((l) => ({ ...l }));
  }

  async delete(fileId: string, linkId: string) {
    const link = this.records.get(linkId);
    if (link?.fileId !== fileId) return false;
    return this.records.delete(linkId);
  }

  async consume(fileId: string, linkId: string, now: number) {
    const link = this.records.get(linkId);
    if (link?.fileId !== fileId || link.expiresAt <= now) return false;
    if (link.maxDownloads !== undefined && link.downloads >= link.maxDownloads) return false;
    link.downloads += 1;
    return true;
  }
}
