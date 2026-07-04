# Production Database Migrations

This project uses Drizzle Kit migrations from `packages/db/drizzle`.

## Production target

- Host: `38.54.93.72`
- Port: `5555`
- Database: `cam-travel`
- User: `postgres`
- Connection string source: `.env.production` (`DATABASE_URL`)

Do not commit production credentials. Keep `.env.production` gitignored and avoid pasting the full `DATABASE_URL` into docs, chat logs, or shell history when possible.

## Run migrations

From the repository root:

```bash
set -a
source .env.production
set +a
bun run db:migrate
```

The root `db:migrate` script delegates to `packages/db`:

```bash
bun --filter @repo/db db:migrate
```

`packages/db/drizzle.config.ts` reads `DATABASE_URL` from the environment first. If it is not set, it falls back to `apps/backend/auth/.env`, which is for local/dev usage.

## Verify migration ledger

The production database stores Drizzle migration records in `drizzle.__drizzle_migrations`.

```bash
set -a
source .env.production
set +a
bun -e 'import pg from "pg"; const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); const result = await pool.query("select id, created_at from drizzle.__drizzle_migrations order by id"); console.log(JSON.stringify(result.rows, null, 2)); await pool.end();'
```

On 2026-07-04, production was migrated successfully through the repo's current migration set:

- `0000_fresh_electro`
- `0001_classy_morbius`
- `0002_strong_ted_forrester`
- `0003_eminent_franklin_richards`
- `0004_curved_northstar`
- `0005_optimal_the_leader`
- `0006_polite_hairball`
- `0007_opposite_tyrannus`

Verification showed 8 rows in `drizzle.__drizzle_migrations`, matching the 8 migration files.

## Before future production runs

1. Review any new SQL files in `packages/db/drizzle/*.sql`.
2. Confirm `.env.production` points at the intended production database.
3. Run `bun run db:migrate` from the repo root with `DATABASE_URL` loaded.
4. Verify the migration ledger after the command completes.
