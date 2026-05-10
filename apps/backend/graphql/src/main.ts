import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Transport, type MicroserviceOptions } from "@nestjs/microservices";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // The dashboard connects to /graphql directly (over WS) for subscriptions —
  // browser origin needs to be allowed.
  app.enableCors({
    origin: ["http://localhost:5173"],
    credentials: true,
  });

  app.connectMicroservice<MicroserviceOptions>({
    transport: Transport.TCP,
    options: {
      host: process.env.GRAPHQL_TCP_HOST ?? "127.0.0.1",
      port: Number(process.env.GRAPHQL_TCP_PORT ?? 4002),
    },
  });

  // Run module init (which builds the Apollo schema and populates
  // GraphQLSchemaHost) BEFORE opening the TCP transport. Otherwise the gateway
  // can fire a graphql.execute message into the controller before the schema
  // exists, surfacing as "GraphQL schema has not yet been created".
  await app.init();

  await app.startAllMicroservices();
  await app.listen(process.env.PORT ?? 3002);
}
bootstrap();
