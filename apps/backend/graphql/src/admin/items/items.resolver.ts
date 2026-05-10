import { Resolver } from "@nestjs/graphql";
import { CrudResolver } from "../../lib/nestjs-query-drizzle";
import { CreateItemInput } from "./dto/create-item.input";
import { UpdateItemInput } from "./dto/update-item.input";
import { ItemDto } from "./dto/item.dto";
import { ItemsService } from "./items.service";

@Resolver(() => ItemDto)
export class ItemsResolver extends CrudResolver({
  DTOClass: ItemDto,
  CreateDTOClass: CreateItemInput,
  UpdateDTOClass: UpdateItemInput,
  enableSubscriptions: true,
}) {
  constructor(private readonly items: ItemsService) {
    super(items);
  }
}
