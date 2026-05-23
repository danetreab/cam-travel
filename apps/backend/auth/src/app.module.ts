import { Module } from "@nestjs/common";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { createDb, DRIZZLE_DB } from "@repo/db";
import { auth } from "./auth/auth";
import { HealthController } from "./health.controller";
import { SeedService } from "./seed.service";

@Module({
  imports: [AuthModule.forRoot({ auth })],
  controllers: [HealthController],
  providers: [
    {
      provide: DRIZZLE_DB,
      useFactory: () => {
        const { db } = createDb(process.env.DATABASE_URL!);
        return db;
      },
    },
    SeedService,
  ],
})
export class AppModule {}
