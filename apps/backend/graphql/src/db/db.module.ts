import { Global, Module } from "@nestjs/common";
import { createDb, DRIZZLE_DB } from "@repo/db";

// Global so feature modules don't have to import DbModule explicitly to inject
// the connection. Single pool per process — created at provider construction.
@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DB,
      useFactory: () => {
        const url = process.env.DATABASE_URL;
        if (!url) throw new Error("DATABASE_URL is required");
        return createDb(url).db;
      },
    },
  ],
  exports: [DRIZZLE_DB],
})
export class DbModule {}
