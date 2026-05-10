import { Inject, Injectable } from "@nestjs/common";
import type { Client as MinioClient } from "minio";
import { MINIO_BUCKET, MINIO_CLIENT } from "./minio.tokens";

// Thin wrapper around the shared MinIO client (provided by MinioModule, which
// is @Global). Exposes the operations the upload flow actually needs —
// putObject, presigned GET, bulk delete.
@Injectable()
export class StorageService {
  constructor(
    @Inject(MINIO_CLIENT) private readonly client: MinioClient,
    @Inject(MINIO_BUCKET) private readonly bucket: string,
  ) {}

  async uploadFile(
    filename: string,
    buffer: Buffer,
    mimetype: string,
  ): Promise<void> {
    await this.client.putObject(this.bucket, filename, buffer, buffer.length, {
      "Content-Type": mimetype,
    });
  }

  async getPresignedUrl(
    filename: string,
    expirySeconds = 7200,
  ): Promise<string> {
    return this.client.presignedGetObject(
      this.bucket,
      filename,
      expirySeconds,
    );
  }

  async deleteFiles(filenames: string[]): Promise<void> {
    if (filenames.length === 0) return;
    await this.client.removeObjects(this.bucket, filenames);
  }
}
