# syntax=docker/dockerfile:1.7
# Build context is the repo root (see docker-compose).

# --- builder ----------------------------------------------------------------
FROM oven/bun:1.2.22-alpine AS builder
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
RUN bun --filter @repo/db build
RUN bun --filter @repo/api-gateway build

# --- runtime ----------------------------------------------------------------
FROM oven/bun:1.2.22-alpine
WORKDIR /app
COPY --from=builder /repo /app
WORKDIR /app/apps/backend/api-gateway
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "dist/main.js"]
