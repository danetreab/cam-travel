import { Inject, Injectable } from "@nestjs/common";
import { DRIZZLE_DB, type Db, item } from "@repo/db";
import { DrizzleQueryService } from "../../lib/nestjs-query-drizzle";
import type { ItemDto } from "./dto/item.dto";

@Injectable()
export class ItemsService extends DrizzleQueryService<ItemDto> {
  constructor(@Inject(DRIZZLE_DB) db: Db) {
    super(db, item, { idColumn: "id", dialect: "pg" });
  }
}
