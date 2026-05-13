import { Inject, Injectable } from "@nestjs/common";
import type { Client as MinioClient } from "minio";
import { MINIO_BUCKET, MINIO_CLIENT } from "./minio.tokens";

// Thin wrapper around the shared MinIO client (provided by MinioModule, which
// is @Global). Exposes the operations the upload flow actually needs —
// putObject, presigned GET, bulk delete.
//
// Presigned URLs are cached in memory: presignedGetObject() returns a fresh
// signature on every call, so without caching the browser sees a different
// URL for the same image on every GraphQL refetch and re-downloads it from
// MinIO instead of using its HTTP cache. The cache TTL is intentionally well
// below the signed expiry so a cached URL is always still usable.
const PRESIGN_EXPIRY_SECONDS = 24 * 60 * 60; // 24h — bound by MinIO's signing window
const PRESIGN_CACHE_TTL_MS   = 12 * 60 * 60 * 1000; // 12h — half of expiry

interface CachedUrl {
  url: string;
  expiresAt: number;
}

@Injectable()
export class StorageService {
  private readonly urlCache = new Map<string, CachedUrl>();

  constructor(
    @Inject(MINIO_CLIENT) private readonly client: MinioClient,
    @Inject(MINIO_BUCKET) private readonly bucket: string,
  ) {}

  async uploadFile(
    filename: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<void> {
    // Filenames are timestamp-prefixed (`<unix_ms>_<sanitized>`), so a given
    // filename is effectively content-addressed and never overwritten —
    // safe to mark immutable so the browser caches it indefinitely.
    await this.client.putObject(this.bucket, filename, buffer, buffer.length, {
      "Content-Type": mimetype,
      "Cache-Control": "public, max-age=31536000, immutable",
    });
    this.urlCache.delete(filename);
  }

  async getPresignedUrl(
    filename: string,
    expirySeconds = PRESIGN_EXPIRY_SECONDS,
  ): Promise<string> {
    const now = Date.now();
    const cached = this.urlCache.get(filename);
    if (cached && cached.expiresAt > now) {
      return cached.url;
    }
    const url = await this.client.presignedGetObject(
      this.bucket,
      filename,
      expirySeconds,
    );
    this.urlCache.set(filename, { url, expiresAt: now + PRESIGN_CACHE_TTL_MS });
    return url;
  }

  async deleteFiles(filenames: string[]): Promise<void> {
    if (filenames.length === 0) return;
    await this.client.removeObjects(this.bucket, filenames);
    for (const f of filenames) this.urlCache.delete(f);
  }
}
