import { Inject, Injectable } from "@nestjs/common";
import { DRIZZLE_DB, type Db, user } from "@repo/db";
import { DrizzleQueryService } from "../../lib/nestjs-query-drizzle";
import type { UserDto } from "./dto/user.dto";

@Injectable()
export class UsersService extends DrizzleQueryService<UserDto> {
  constructor(@Inject(DRIZZLE_DB) db: Db) {
    super(db, user, { idColumn: "id", dialect: "pg" });
  }
}
