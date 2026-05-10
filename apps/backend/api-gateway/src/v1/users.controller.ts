import { Controller, Get } from "@nestjs/common";

const DUMMY_USERS = [
  { id: "1", name: "Alice", email: "alice@example.com" },
  { id: "2", name: "Bob", email: "bob@example.com" },
  { id: "3", name: "Carol", email: "carol@example.com" },
];

@Controller("api/v1/users")
export class UsersController {
  @Get()
  list() {
    return DUMMY_USERS;
  }
}
