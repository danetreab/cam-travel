import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { createProxyMiddleware } from "http-proxy-middleware";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: ["http://localhost:5173"],
    credentials: true,
  });

  // Auth still goes over HTTP — better-auth requires HTTP semantics
  // (cookies, OAuth redirects). Proxy /api/auth/* straight through.
  app.use(
    createProxyMiddleware({
      pathFilter: "/api/auth/**",
      target: process.env.AUTH_SERVICE_URL ?? "http://localhost:3001",
      changeOrigin: true,
      xfwd: true,
    }),
  );

  // Multipart file upload endpoints live on the graphql service. They can't
  // be sent over the Redis/TCP microservice transport (which is JSON-only),
  // so we HTTP-proxy them like /api/auth/*. Browser requests stay same-origin
  // and the better-auth session cookie still applies.
  const graphqlHttpUrl =
    process.env.GRAPHQL_HTTP_URL ?? "http://localhost:3002";
  app.use(
    createProxyMiddleware({
      pathFilter: [
        "/api/v1/items/*/files",
        "/api/v1/items/*/files/**",
        "/api/v1/attractions/*/files",
        "/api/v1/attractions/*/files/**",
        "/api/v1/uploaded-files/**",
      ],
      target: graphqlHttpUrl,
      changeOrigin: true,
      xfwd: true,
    }),
  );

  // /graphql is no longer HTTP-proxied. It's handled by GraphqlController,
  // which forwards the query to the graphql service over Redis transport.

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
