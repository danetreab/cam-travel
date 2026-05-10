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

const ENTITY_TYPE = "attraction" as const;

// Multi-file upload (images + videos) for attractions. Mirror of the items
// controller — files are persisted via UploadService and tagged
// (entityType="attraction", entityId=:attractionId). Videos bypass the image
// compression path automatically (see uploads/compression.service.ts).
@Controller("api/v1/attractions/:attractionId/files")
export class AttractionsFilesController {
  constructor(private readonly uploads: UploadService) {}

  @Post()
  @UseInterceptors(FilesInterceptor("files", 10))
  uploadMany(
    @Param("attractionId") attractionId: string,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    return this.uploads.uploadMany(files, {
      entityType: ENTITY_TYPE,
      entityId: attractionId,
    });
  }

  @Get()
  list(@Param("attractionId") attractionId: string) {
    return this.uploads.getFilesByEntity(ENTITY_TYPE, attractionId);
  }

  @Delete()
  @HttpCode(204)
  async deleteAll(@Param("attractionId") attractionId: string) {
    await this.uploads.deleteFilesByEntity(ENTITY_TYPE, attractionId);
  }
}
