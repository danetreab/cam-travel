import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as authSchema from "./schema";
import * as itemsSchema from "./items";
import * as attractionsSchema from "./attractions";
import * as savedAttractionsSchema from "./saved-attractions";
import * as uploadedFilesSchema from "./uploaded-files";
import * as aiTravelPlansSchema from "./ai-travel-plans";

const schema = {
  ...authSchema,
  ...itemsSchema,
  ...attractionsSchema,
  ...savedAttractionsSchema,
  ...uploadedFilesSchema,
  ...aiTravelPlansSchema,
};

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema>;

export interface CreateDbResult {
  pool: Pool;
  db: Db;
}

// Side-effect-free factory: callers own when the pool is created and which
// connection string to use (env, secrets manager, test override, etc.). Apps
// typically call this once at startup and inject the result.
export function createDb(
  connectionString: string,
  poolOverrides?: Omit<PoolConfig, "connectionString">,
): CreateDbResult {
  if (!connectionString) {
    throw new Error("createDb: connectionString is required");
  }
  const pool = new Pool({ connectionString, ...poolOverrides });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

// String token usable as a NestJS DI token without forcing this package to
// depend on @nestjs/common. The graphql app re-exports it from its DbModule.
export const DRIZZLE_DB = "DRIZZLE_DB" as const;
