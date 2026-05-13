import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import type { Client as MinioClient } from "minio";
import { REDIS_CLIENT } from "../cache/redis.tokens";
import { MINIO_BUCKET, MINIO_CLIENT } from "./minio.tokens";

// Thin wrapper around the shared MinIO client (provided by MinioModule, which
// is @Global). Exposes the operations the upload flow actually needs —
// putObject, presigned GET, bulk delete.
//
// Presigned URLs are cached in Redis: presignedGetObject() returns a fresh
// signature on every call, so without caching the browser sees a different
// URL for the same image on every GraphQL refetch and re-downloads it from
// MinIO instead of using its HTTP cache. Redis (vs in-memory) keeps the
// cache shared across container replicas and survives restarts. The cache
// TTL is well below the signed expiry so a cached URL is always still usable.
const PRESIGN_EXPIRY_SECONDS  = 24 * 60 * 60; // 24h — bound by MinIO's signing window
const PRESIGN_CACHE_TTL_SECS  = 12 * 60 * 60; // 12h — half of expiry
const PRESIGN_CACHE_KEY_PREFIX = "presigned:";

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    @Inject(MINIO_CLIENT) private readonly client: MinioClient,
    @Inject(MINIO_BUCKET) private readonly bucket: string,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
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
    await this.invalidateCachedUrl(filename);
  }

  async getPresignedUrl(
    filename: string,
    expirySeconds = PRESIGN_EXPIRY_SECONDS,
  ): Promise<string> {
    const key = this.cacheKey(filename);

    // Redis is treated as best-effort cache — a Redis outage must NOT break
    // image loading. Catch + fall through to direct presigning.
    try {
      const cached = await this.redis.get(key);
      if (cached) return cached;
    } catch (err) {
      this.logger.warn(
        `redis GET failed for ${key}: ${(err as Error).message}`,
      );
    }

    const url = await this.client.presignedGetObject(
      this.bucket,
      filename,
      expirySeconds,
    );

    try {
      await this.redis.set(key, url, "EX", PRESIGN_CACHE_TTL_SECS);
    } catch (err) {
      this.logger.warn(
        `redis SET failed for ${key}: ${(err as Error).message}`,
      );
    }
    return url;
  }

  async deleteFiles(filenames: string[]): Promise<void> {
    if (filenames.length === 0) return;
    await this.client.removeObjects(this.bucket, filenames);
    await Promise.all(filenames.map((f) => this.invalidateCachedUrl(f)));
  }

  private cacheKey(filename: string): string {
    return `${PRESIGN_CACHE_KEY_PREFIX}${this.bucket}:${filename}`;
  }

  private async invalidateCachedUrl(filename: string): Promise<void> {
    try {
      await this.redis.del(this.cacheKey(filename));
    } catch (err) {
      this.logger.warn(
        `redis DEL failed for ${filename}: ${(err as Error).message}`,
      );
    }
  }
}
