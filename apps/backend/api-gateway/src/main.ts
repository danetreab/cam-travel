import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { createProxyMiddleware } from "http-proxy-middleware";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Comma-separated list, e.g. "https://example.com,https://admin.example.com".
  // Falls back to dev origins if unset.
  const corsOrigins = (
    process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:5174"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: corsOrigins, credentials: true });

  // NOTE: /api/auth/** is no longer proxied through here. The auth service
  // is exposed on its own subdomain (VITE_AUTH_URL → https://auth.<host>)
  // and browsers call it directly. We tried proxying through this gateway
  // and it silently broke every JSON POST: NestJS's default Express body
  // parser consumes the request stream before http-proxy-middleware can
  // forward it, so better-auth received an empty body and returned a bare
  // "Internal Server Error" (no CORS, no Content-Type). If you ever bring
  // auth back behind this gateway, you must re-serialize the body via
  // `fixRequestBody` from http-proxy-middleware AND keep NestJS's body
  // parser enabled (other controllers like GraphqlController use @Body()).
  // See git history for the working proxy + fixRequestBody config.

  // Multipart file upload endpoints live on the graphql service. They can't
  // be sent over the TCP microservice transport (which is JSON-only), so we
  // HTTP-proxy them. The session cookie rides along via the shared
  // parent-domain cookie set by auth.
  const graphqlHttpUrl =
    process.env.GRAPHQL_HTTP_URL ?? "http://localhost:3002";
  app.use(
    createProxyMiddleware({
      pathFilter: [
        "/api/v1/items/*/files",
        "/api/v1/items/*/files/**",
        "/api/v1/attractions/*/files",
        "/api/v1/attractions/*/files/**",
        "/api/v1/attractions/*/photos",
        "/api/v1/attractions/*/photos/**",
        "/api/v1/uploaded-files/**",
      ],
      target: graphqlHttpUrl,
      changeOrigin: true,
    }),
  );

  // /graphql/v1 is no longer HTTP-proxied. It's handled by GraphqlController,
  // which forwards the query to the graphql service over the TCP microservice
  // transport.

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
