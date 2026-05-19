import { Logger } from "@nestjs/common";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createDb, schema } from "@repo/db";
import { redis } from "../redis";

const { db } = createDb(process.env.DATABASE_URL!);

// Must match the auth service's cookie-scope config so the gateway reads the
// same cookie name/format that auth set. See apps/backend/auth/src/auth/auth.ts.
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;

// Redis is a *secondary* cache for sessions — Postgres is the source of
// truth. Swallow per-op errors so a Redis blip falls back to the primary
// store instead of failing AuthGuard (which would block every /graphql/v1
// request). Keep behavior identical to the auth service.
const redisLog = new Logger("better-auth:redis");

// The gateway is the single auth checkpoint for browser traffic. It validates
// sessions via better-auth, reading from Redis (secondaryStorage) first and
// falling back to Postgres. Internal services (graphql) trust the gateway.
export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  secondaryStorage: {
    get: async (key) => {
      try {
        return await redis.get(key);
      } catch (err) {
        redisLog.warn(
          `get(${key}) failed, falling back to primary store: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        return null;
      }
    },
    set: async (key, value, ttl) => {
      try {
        if (ttl) {
          await redis.set(key, value, "EX", ttl);
        } else {
          await redis.set(key, value);
        }
      } catch (err) {
        redisLog.warn(
          `set(${key}) failed, primary store will still be written: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    },
    delete: async (key) => {
      try {
        await redis.del(key);
      } catch (err) {
        redisLog.warn(
          `delete(${key}) failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
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
