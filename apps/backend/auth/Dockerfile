# syntax=docker/dockerfile:1.7
# Build context is the repo root (see docker-compose).

# --- builder: install workspace deps + compile @repo/db + this service ------
FROM oven/bun:1.2.22-alpine AS builder
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile
RUN bun --filter @repo/db build
RUN bun --filter @repo/auth build

# --- runtime: minimal image with the built dist + node_modules --------------
FROM oven/bun:1.2.22-alpine
WORKDIR /app
COPY --from=builder /repo /app
WORKDIR /app/apps/backend/auth
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["bun", "run", "dist/main.js"]
