import { Resolver } from "@nestjs/graphql";
import { CrudResolver } from "../../lib/nestjs-query-drizzle";
// import { CreateUserInput } from "./dto/create-user.input";
// import { UpdateUserInput } from "./dto/update-user.input";
import { UserDto } from "./dto/user.dto";
import { UsersService } from "./users.service";

@Resolver(() => UserDto)
export class UsersResolver extends CrudResolver({
  DTOClass: UserDto,
  // CreateDTOClass: CreateUserInput,
  // UpdateDTOClass: UpdateUserInput,
  enableSubscriptions: true,
  // permissions: {
  //   read: { user: ["list"] },
  //   create: { user: ["create"] },
  //   update: { user: ["update"] },
  //   delete: { user: ["delete"] },
  // },
}) {
  constructor(private readonly users: UsersService) {
    super(users);
  }
}
