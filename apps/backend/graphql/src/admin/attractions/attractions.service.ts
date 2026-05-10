import { Inject, Injectable } from "@nestjs/common";
import { DRIZZLE_DB, type Db, attraction } from "@repo/db";
import { DrizzleQueryService } from "../../lib/nestjs-query-drizzle";
import type { AttractionDto } from "./dto/attraction.dto";

@Injectable()
export class AttractionsService extends DrizzleQueryService<AttractionDto> {
  constructor(@Inject(DRIZZLE_DB) db: Db) {
    super(db, attraction, { idColumn: "id", dialect: "pg" });
  }
}
