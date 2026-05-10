import { Module } from "@nestjs/common";
import { UploadsModule } from "../../uploads/uploads.module";
import { ItemsService } from "./items.service";
import { ItemsResolver } from "./items.resolver";
import { ItemFilesResolver } from "./item-files.resolver";
import {
  ItemsFilesController,
  UploadedFilesController,
} from "./items-files.controller";

@Module({
  imports: [UploadsModule],
  controllers: [ItemsFilesController, UploadedFilesController],
  providers: [ItemsResolver, ItemsService, ItemFilesResolver],
})
export class ItemsModule {}
