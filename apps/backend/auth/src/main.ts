import "dotenv/config";
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  // CORS with credentials. We cannot use "*" when credentials are on, so
  // reflect the incoming Origin header — fine for first-party clients in
  // dev. Lock this down to an explicit list before prod.
  app.enableCors({
    origin: true,
    credentials: true,
  });
  await app.listen(process.env.PORT ?? 3001);
}
bootstrap();
