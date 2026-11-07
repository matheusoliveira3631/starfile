import type { FileRecord, FileRepository } from '../src/files/repository.js';
import type { CreateUploadInput, FileStorage } from '../src/files/storage.js';

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

  async markReady(id: string) {
    return this.transition(id, (r) => {
      r.status = 'ready';
      delete r.expiresAt;
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
