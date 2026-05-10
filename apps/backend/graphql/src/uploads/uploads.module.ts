import { Module } from "@nestjs/common";
import { CompressionService } from "./compression.service";
import { MinioModule } from "./minio.module";
import { StorageService } from "./storage.service";
import { UploadService } from "./upload.service";

// Reusable upload primitives. Any feature module that wants to attach files
// to its entities (items, posts, …) imports this and asks UploadService to
// stamp `entityType` + `entityId` on each row.
@Module({
  imports: [MinioModule],
  providers: [CompressionService, StorageService, UploadService],
  exports: [UploadService],
})
export class UploadsModule {}
