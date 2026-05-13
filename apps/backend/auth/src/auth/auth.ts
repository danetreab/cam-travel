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
