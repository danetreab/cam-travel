import { join } from "node:path";
import { Module } from "@nestjs/common";
import { ApolloDriver, type ApolloDriverConfig } from "@nestjs/apollo";
import { ConfigModule } from "@nestjs/config";
import { GraphQLModule } from "@nestjs/graphql";
import type { Request, Response } from "express";
import { DbModule } from "./db/db.module";
import { RedisModule } from "./cache/redis.module";
import { PostsModule } from "./posts/posts.module";
import { GraphqlMicroserviceController } from "./transport/graphql-microservice.controller";
import { UsersModule } from "./admin/users/users.module";
import { ItemsModule } from "./admin/items/items.module";
import { AttractionsModule } from "./admin/attractions/attractions.module";
import { SavedAttractionsModule } from "./admin/saved-attractions/saved-attractions.module";
import { UploadsModule } from "./uploads/uploads.module";
import { AiTravelModule } from "./ai/ai-travel.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DbModule,
    RedisModule,
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: join(process.cwd(), "schema.gql"),
      playground: true,
      // Versioned alongside the REST surface (api/v1/*). Subscriptions and the
      // playground are served at the same path; the gateway forwards HTTP
      // requests at /graphql/v1 over TCP to this service.
      path: "/graphql/v1",
      // graphql-ws is what refine's liveProvider speaks. The dashboard subscribes
      // directly to ws://<this-service>:PORT/graphql/v1 because the gateway's TCP
      // microservice channel is request/response only.
      subscriptions: {
        "graphql-ws": true,
      },
      context: ({ req, res }: { req: Request; res: Response }) => ({
        req,
        res,
      }),
    }),
    PostsModule,
    UsersModule,
    ItemsModule,
    AttractionsModule,
    SavedAttractionsModule,
    UploadsModule,
    AiTravelModule,
  ],
  controllers: [GraphqlMicroserviceController],
})
export class AppModule {}
