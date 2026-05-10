import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// `bun --filter @repo/db db:migrate` runs inside this package, so no app's
// .env is auto-loaded. Pull DATABASE_URL from auth's .env (the canonical
// source — auth runs `better-auth generate` which owns schema.ts) unless
// the caller already set it in the environment.
if (!process.env.DATABASE_URL) {
  // override: true so an empty-string DATABASE_URL doesn't block the load.
  // dotenv refuses to overwrite an already-set var by default, even if blank.
  config({ path: "../../apps/backend/auth/.env", override: true });
}

export default defineConfig({
  schema: [
    "./src/schema.ts",
    "./src/items.ts",
    "./src/attractions.ts",
    "./src/uploaded-files.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
