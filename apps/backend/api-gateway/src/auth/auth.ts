import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createDb, schema } from "@repo/db";
import { redis } from "../redis";

const { db } = createDb(process.env.DATABASE_URL!);

// Must match the auth service's cookie-scope config so the gateway reads the
// same cookie name/format that auth set. See apps/backend/auth/src/auth/auth.ts.
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;

// The gateway is the single auth checkpoint for browser traffic. It validates
// sessions via better-auth, reading from Redis (secondaryStorage) first and
// falling back to Postgres. Internal services (graphql) trust the gateway.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secondaryStorage: {
    get: async (key) => redis.get(key),
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
  ...(cookieDomain
    ? {
        advanced: {
          crossSubDomainCookies: {
            enabled: true,
            domain: cookieDomain,
          },
        },
      }
    : {}),
});
