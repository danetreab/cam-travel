import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // CORS with credentials — explicit allowlist (browser rejects "*" when
  // credentials: true). In prod, auth normally sits behind the gateway, but
  // OAuth callback redirects can hit it directly so we still need this.
  const corsOrigins = (
    process.env.CORS_ORIGINS ??
    "http://localhost:5173,http://localhost:5174,http://localhost:3000"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
