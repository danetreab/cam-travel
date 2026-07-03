import { Module } from "@nestjs/common";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { AiController } from "../v1/ai.controller";
import { GraphqlController } from "./graphql.controller";
import { GRAPHQL_CLIENT } from "./graphql.tokens";

@Module({
  imports: [
    ClientsModule.register([
      {
        name: GRAPHQL_CLIENT,
        transport: Transport.TCP,
        options: {
          host: process.env.GRAPHQL_TCP_HOST ?? "127.0.0.1",
          port: Number(process.env.GRAPHQL_TCP_PORT ?? 4002),
        },
      },
    ]),
  ],
  controllers: [GraphqlController, AiController],
})
export class GraphqlModule {}
