import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createDb, schema } from "@repo/db";
import { redis } from "../redis";

const { db } = createDb(process.env.DATABASE_URL!);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secondaryStorage: {
    get: async (key) => {
      const value = await redis.get(key);
      return value;
    },
    set: async (key, value, ttl) => {
      if (ttl) {
        await redis.set(key, value, "EX", ttl);
      } else {
        await redis.set(key, value);
      }
    },
    delete: async (key) => {
      await redis.del(key);
    },
  },
  emailAndPassword: { enabled: true },
  plugins: [admin()],
  trustedOrigins: ["*"],
});
