# syntax=docker/dockerfile:1.7
# Build context is the repo root (see docker-compose).

# --- builder ----------------------------------------------------------------
FROM oven/bun:1.2.22-alpine AS builder
WORKDIR /repo
# sharp needs vips at install time on alpine
RUN apk add --no-cache vips-dev build-base python3
COPY . .
RUN bun install --frozen-lockfile
RUN bun --filter @repo/db build
RUN bun --filter @repo/graphql build

# --- runtime ----------------------------------------------------------------
FROM oven/bun:1.2.22-alpine
RUN apk add --no-cache vips
WORKDIR /app
COPY --from=builder /repo /app
WORKDIR /app/apps/backend/graphql
ENV NODE_ENV=production
ENV PORT=3002
ENV GRAPHQL_TCP_HOST=0.0.0.0
ENV GRAPHQL_TCP_PORT=4002
EXPOSE 3002 4002
CMD ["bun", "run", "dist/main.js"]
