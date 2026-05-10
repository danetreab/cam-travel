import { Module } from "@nestjs/common";
import { UploadsModule } from "../../uploads/uploads.module";
import { AttractionsService } from "./attractions.service";
import { AttractionsResolver } from "./attractions.resolver";
import { AttractionFilesResolver } from "./attraction-files.resolver";
import { AttractionsFilesController } from "./attractions-files.controller";
import { AttractionsPhotosController } from "./attractions-photos.controller";
import { PlacesService } from "./places.service";
import { PlacesEnrichmentResolver } from "./places-enrichment.resolver";

@Module({
  imports: [UploadsModule],
  controllers: [AttractionsFilesController, AttractionsPhotosController],
  providers: [
    AttractionsResolver,
    AttractionsService,
    AttractionFilesResolver,
    PlacesService,
    PlacesEnrichmentResolver,
  ],
})
export class AttractionsModule {}
