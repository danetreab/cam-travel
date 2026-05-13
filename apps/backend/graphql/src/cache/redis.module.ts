import { Global, Logger, Module } from "@nestjs/common";
import Redis from "ioredis";
import { REDIS_CLIENT } from "./redis.tokens";

// Single shared ioredis client per process. Marked @Global so any feature
// module can inject the client via REDIS_CLIENT without re-importing.
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const url = process.env.REDIS_URL;
        if (!url) throw new Error("REDIS_URL is required");
        const client = new Redis(url, {
          lazyConnect: true,
          maxRetriesPerRequest: 3,
          connectTimeout: 5000,
          commandTimeout: 3000,
          enableReadyCheck: true,
        });
        const logger = new Logger("Redis");
        client.on("error", (err) =>
          logger.warn(`connection error: ${err.message}`),
        );
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
