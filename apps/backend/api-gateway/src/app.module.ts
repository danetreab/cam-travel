import { Module } from "@nestjs/common";
import { GraphqlModule } from "./graphql/graphql.module";
import { HealthController } from "./v1/health.controller";
import { ItemsController } from "./v1/items.controller";
import { UsersController } from "./v1/users.controller";

@Module({
  imports: [GraphqlModule],
  controllers: [HealthController, ItemsController, UsersController],
})
export class AppModule {}
