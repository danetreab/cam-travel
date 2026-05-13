# syntax=docker/dockerfile:1.7
# Build context is the repo root (see docker-compose).
#
# Vite/TanStack Start bakes VITE_* env vars into the bundle at BUILD time, so
# they must be passed as build args (see docker-compose.yml `args:` block).

# --- builder ----------------------------------------------------------------
FROM oven/bun:1.2.22-alpine AS builder
WORKDIR /repo

ARG VITE_API_URL
ARG VITE_GRAPHQL_HTTP_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_PUBLIC_MAP_KEY
ENV VITE_API_URL=$VITE_API_URL \
    VITE_GRAPHQL_HTTP_URL=$VITE_GRAPHQL_HTTP_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_PUBLIC_MAP_KEY=$VITE_PUBLIC_MAP_KEY

COPY . .
RUN bun install --frozen-lockfile
RUN bun --filter web build

# --- runtime: nitro server -------------------------------------------------
FROM oven/bun:1.2.22-alpine
WORKDIR /app
COPY --from=builder /repo/apps/web/.output /app/.output
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
EXPOSE 3000
CMD ["bun", "run", ".output/server/index.mjs"]
