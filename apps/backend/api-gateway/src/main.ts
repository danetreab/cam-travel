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

  // /api/auth/** proxies to the auth service over Docker-internal networking.
  // The frontends only know about this gateway — they never call auth
  // directly. better-auth on the auth service must have BETTER_AUTH_URL set
  // to this gateway's public URL so it sets cookies and computes OAuth
  // callback URLs against the domain the browser actually sees.
  const authServiceUrl =
    process.env.AUTH_SERVICE_URL ?? "http://localhost:3001";
  app.use(
    createProxyMiddleware({
      // Predicate form rather than an array literal: http-proxy-middleware v3
      // rejects mixed string + glob arrays and silently drops requests when
      // the matcher throws — the symptom was a 404 on the OAuth callback.
      pathFilter: (pathname) => pathname.startsWith("/api/auth"),
      target: authServiceUrl,
      changeOrigin: true,
    }),
  );

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
