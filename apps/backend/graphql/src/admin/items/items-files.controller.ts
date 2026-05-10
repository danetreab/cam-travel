import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFiles,
  UseInterceptors,
} from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { UploadService } from "../../uploads/upload.service";

const ENTITY_TYPE = "item" as const;

// Multi-file upload for items. Each item is identified by its UUID; uploads
// are persisted via UploadService and stamped with (entityType="item",
// entityId=:itemId) so they can be queried/cleaned up later.
@Controller("api/v1/items/:itemId/files")
export class ItemsFilesController {
  constructor(private readonly uploads: UploadService) {}

  @Post()
  @UseInterceptors(FilesInterceptor("files", 10))
  uploadMany(
    @Param("itemId") itemId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.uploads.uploadMany(files, {
      entityType: ENTITY_TYPE,
      entityId: itemId,
    });
  }

  @Get()
  list(@Param("itemId") itemId: string) {
    return this.uploads.getFilesByEntity(ENTITY_TYPE, itemId);
  }

  @Delete()
  @HttpCode(204)
  async deleteAll(@Param("itemId") itemId: string) {
    await this.uploads.deleteFilesByEntity(ENTITY_TYPE, itemId);
  }
}

@Controller("api/v1/uploaded-files")
export class UploadedFilesController {
  constructor(private readonly uploads: UploadService) {}

  @Delete(":id")
  @HttpCode(204)
  async deleteOne(@Param("id") id: string) {
    await this.uploads.deleteFile(id);
  }
}
