import { Parent, ResolveField, Resolver } from "@nestjs/graphql";
import { UploadService } from "../../uploads/upload.service";
import { ItemDto } from "./dto/item.dto";
import { ItemFileDto } from "./dto/item-file.dto";

// Adds a `files` field to the auto-generated Item type. Each item can have
// multiple uploaded files via the polymorphic uploaded_file table.
@Resolver(() => ItemDto)
export class ItemFilesResolver {
  constructor(private readonly uploads: UploadService) {}

  @ResolveField("files", () => [ItemFileDto])
  async files(@Parent() item: ItemDto): Promise<ItemFileDto[]> {
    return this.uploads.getFilesByEntity("item", item.id);
  }
}
