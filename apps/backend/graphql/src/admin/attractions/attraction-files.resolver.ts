import { Parent, ResolveField, Resolver } from "@nestjs/graphql";
import { UploadService } from "../../uploads/upload.service";
import { AttractionDto } from "./dto/attraction.dto";
import { AttractionFileDto } from "./dto/attraction-file.dto";

// Polymorphic file relationship: each attraction can have multiple uploaded
// images/videos via the uploaded_file table tagged (entityType="attraction").
@Resolver(() => AttractionDto)
export class AttractionFilesResolver {
  constructor(private readonly uploads: UploadService) {}

  @ResolveField("files", () => [AttractionFileDto])
  async files(@Parent() attraction: AttractionDto): Promise<AttractionFileDto[]> {
    return this.uploads.getFilesByEntity("attraction", attraction.id);
  }
}
