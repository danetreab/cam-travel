import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { DRIZZLE_DB, type Db, uploadedFile } from "@repo/db";
import dayjs from "dayjs";
import { and, eq } from "drizzle-orm";
import { CompressionService } from "./compression.service";
import { StorageService } from "./storage.service";

export interface UploadFileOptions {
  file: Express.Multer.File;
  entityType?: string;
  entityId?: string;
  relatedType?: string;
  relatedId?: string;
  uploadedById?: string;
}

export interface UploadedFileResponse {
  id: string;
  filename: string;
  originalFilename: string;
  mimetype: string;
  size: number;
  url: string;
  thumbnailUrl?: string;
  hasThumbnail: boolean;
  entityType?: string;
  entityId?: string;
  uploadedById?: string;
  createdAt: Date;
}

@Injectable()
export class UploadService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Db,
    private readonly storage: StorageService,
    private readonly compression: CompressionService,
  ) {}

  async uploadFile(options: UploadFileOptions): Promise<UploadedFileResponse> {
    const { file, entityType, entityId, relatedType, relatedId, uploadedById } =
      options;

    const ts = dayjs().valueOf();
    const sanitized = this.sanitizeFilename(file.originalname);
    const filename = `${ts}_${sanitized}`;

    let processedBuffer = file.buffer;
    let hasThumbnail = false;
    let thumbnailFilename: string | undefined;

    if (this.compression.canCompress(file.mimetype)) {
      processedBuffer = await this.compression.compressImage(file.buffer);
      const thumbnailBuffer = await this.compression.generateThumbnail(
        file.buffer,
      );
      thumbnailFilename = `thumb_${filename}`;
      await this.storage.uploadFile(
        thumbnailFilename,
        thumbnailBuffer,
        "image/jpeg",
      );
      hasThumbnail = true;
    }

    await this.storage.uploadFile(filename, processedBuffer, file.mimetype);

    const [row] = await this.db
      .insert(uploadedFile)
      .values({
        filename,
        originalFilename: file.originalname,
        mimetype: file.mimetype,
        size: processedBuffer.length,
        hasThumbnail,
        entityType,
        entityId,
        relatedType,
        relatedId,
        uploadedById,
        updatedAt: new Date(),
      })
      .returning();

    if (!row) {
      throw new Error("Failed to insert uploaded_file row");
    }
    return this.toResponse(row, hasThumbnail ? thumbnailFilename : undefined);
  }

  async uploadMany(
    files: Express.Multer.File[],
    common: Omit<UploadFileOptions, "file">,
  ): Promise<UploadedFileResponse[]> {
    return Promise.all(
      files.map((file) => this.uploadFile({ ...common, file })),
    );
  }

  async getFileById(id: string): Promise<UploadedFileResponse> {
    const [row] = await this.db
      .select()
      .from(uploadedFile)
      .where(eq(uploadedFile.id, id));
    if (!row) throw new NotFoundException(`File with ID ${id} not found`);
    return this.toResponse(row);
  }

  async getFilesByEntity(
    entityType: string,
    entityId: string,
  ): Promise<UploadedFileResponse[]> {
    const rows = await this.db
      .select()
      .from(uploadedFile)
      .where(
        and(
          eq(uploadedFile.entityType, entityType),
          eq(uploadedFile.entityId, entityId),
        ),
      );
    return Promise.all(rows.map((row) => this.toResponse(row)));
  }

  async deleteFile(id: string): Promise<void> {
    const [row] = await this.db
      .select()
      .from(uploadedFile)
      .where(eq(uploadedFile.id, id));
    if (!row) throw new NotFoundException(`File with ID ${id} not found`);

    const toDelete = [row.filename];
    if (row.hasThumbnail) toDelete.push(`thumb_${row.filename}`);
    await this.storage.deleteFiles(toDelete);

    await this.db.delete(uploadedFile).where(eq(uploadedFile.id, id));
  }

  async deleteFilesByEntity(
    entityType: string,
    entityId: string,
  ): Promise<void> {
    const rows = await this.db
      .select()
      .from(uploadedFile)
      .where(
        and(
          eq(uploadedFile.entityType, entityType),
          eq(uploadedFile.entityId, entityId),
        ),
      );
    if (rows.length === 0) return;

    const toDelete: string[] = [];
    for (const r of rows) {
      toDelete.push(r.filename);
      if (r.hasThumbnail) toDelete.push(`thumb_${r.filename}`);
    }
    await this.storage.deleteFiles(toDelete);

    await this.db
      .delete(uploadedFile)
      .where(
        and(
          eq(uploadedFile.entityType, entityType),
          eq(uploadedFile.entityId, entityId),
        ),
      );
  }

  private async toResponse(
    row: typeof uploadedFile.$inferSelect,
    thumbnailFilenameOverride?: string,
  ): Promise<UploadedFileResponse> {
    const url = await this.storage.getPresignedUrl(row.filename);
    const thumbName = thumbnailFilenameOverride
      ? thumbnailFilenameOverride
      : row.hasThumbnail
        ? `thumb_${row.filename}`
        : undefined;
    const thumbnailUrl = thumbName
      ? await this.storage.getPresignedUrl(thumbName)
      : undefined;

    return {
      id: row.id,
      filename: row.filename,
      originalFilename: row.originalFilename,
      mimetype: row.mimetype,
      size: row.size,
      url,
      thumbnailUrl,
      hasThumbnail: row.hasThumbnail,
      entityType: row.entityType ?? undefined,
      entityId: row.entityId ?? undefined,
      uploadedById: row.uploadedById ?? undefined,
      createdAt: row.createdAt,
    };
  }

  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/^.*[\\/]/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .toLowerCase();
  }
}
