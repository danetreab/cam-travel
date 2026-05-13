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

  // /api/auth/** is no longer proxied here. The browser talks to the auth
  // service directly on its own Coolify domain, and better-auth's
  // crossSubDomainCookies setting keeps the session cookie visible to both
  // hostnames so the gateway's AuthGuard still sees authenticated requests.

  // Multipart file upload endpoints live on the graphql service. They can't
  // be sent over the Redis/TCP microservice transport (which is JSON-only),
  // so we HTTP-proxy them. The session cookie rides along via the shared
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
        "/api/v1/uploaded-files/**",
      ],
      target: graphqlHttpUrl,
      changeOrigin: true,
    }),
  );

  // /graphql is no longer HTTP-proxied. It's handled by GraphqlController,
  // which forwards the query to the graphql service over Redis transport.

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
