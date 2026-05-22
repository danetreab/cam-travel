import { Logger } from "@nestjs/common";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { createDb, schema } from "@repo/db";
import { redis } from "../redis";

const { db } = createDb(process.env.DATABASE_URL!);

// AUTH_COOKIE_DOMAIN scopes the session cookie to a parent domain (e.g.
// ".rikrey.com") so the gateway/graphql/web/dashboard subdomains all see it.
// Leave it unset locally — cookies then stay on the auth service host as
// usual, which is fine because each local service runs on its own port.
const cookieDomain = process.env.AUTH_COOKIE_DOMAIN;

// Redis is a *secondary* cache for sessions — the Postgres adapter is the
// source of truth. If Redis is unreachable (network blip, deploy, hairpin),
// callers should fall through to the primary store instead of 500ing the
// whole request. Swallowing per-op errors gives that behavior: `get` returns
// null on failure (treated as cache miss), `set`/`delete` are best-effort.
const redisLog = new Logger("better-auth:redis");

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
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
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
