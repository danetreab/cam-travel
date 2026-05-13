# syntax=docker/dockerfile:1.7
# Single Dockerfile for all five services. Pick a service via build `target:`.
#
# Stage graph:
#   deps      → shared `bun install` (runs once across the whole compose build)
#   source    → deps + repo source
#   build-db  → @repo/db built once; reused by every backend service
#   build-*   → per-service build outputs
#   <svc>     → per-service runtime image (this is the target compose picks)

# ============================================================================
# Shared install
# ============================================================================
FROM oven/bun:1.2.22-alpine AS deps
WORKDIR /repo
# sharp (via @repo/graphql) needs vips at install time on alpine. Putting it
# in the shared stage keeps the install layer identical for every service.
RUN apk add --no-cache vips-dev build-base python3

COPY package.json bun.lock turbo.json ./
COPY apps/dashboard/package.json apps/dashboard/
COPY apps/web/package.json apps/web/
COPY apps/backend/api-gateway/package.json apps/backend/api-gateway/
COPY apps/backend/auth/package.json apps/backend/auth/
COPY apps/backend/graphql/package.json apps/backend/graphql/
COPY packages/db/package.json packages/db/
COPY packages/eslint-config/package.json packages/eslint-config/
COPY packages/typescript-config/package.json packages/typescript-config/

# sharing=locked: docker compose builds all targets in parallel and every
# one mounts this same cache. Without locking, the parallel `bun install`
# processes race when writing tarballs, leaving partially-written files
# that subsequent readers reject with IntegrityCheckFailed.
RUN --mount=type=cache,target=/root/.bun/install/cache,sharing=locked \
    bun install --frozen-lockfile

FROM deps AS source
COPY . .

# ============================================================================
# Shared @repo/db build (every backend service depends on it)
# ============================================================================
FROM source AS build-db
RUN bun --filter @repo/db build

# ============================================================================
# Per-service build stages
# ============================================================================
# VITE_* values are baked into the client bundle at build time. Coolify
# passes them as --build-arg (see "Available at Buildtime" in its UI), and
# the ARG/ENV lines below receive them and expose them to the Vite build.
FROM source AS build-dashboard
ARG VITE_API_URL
ARG VITE_AUTH_URL
ARG VITE_GRAPHQL_WS_URL
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_GOOGLE_MAPS_ID
ENV VITE_API_URL=$VITE_API_URL \
    VITE_AUTH_URL=$VITE_AUTH_URL \
    VITE_GRAPHQL_WS_URL=$VITE_GRAPHQL_WS_URL \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    VITE_GOOGLE_MAPS_ID=$VITE_GOOGLE_MAPS_ID
RUN bun --filter @repo/dashboard build

FROM source AS build-web
ARG VITE_API_URL
ARG VITE_AUTH_URL
ARG VITE_GRAPHQL_HTTP_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_PUBLIC_MAP_KEY
ENV VITE_API_URL=$VITE_API_URL \
    VITE_AUTH_URL=$VITE_AUTH_URL \
    VITE_GRAPHQL_HTTP_URL=$VITE_GRAPHQL_HTTP_URL \
    VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_PUBLIC_MAP_KEY=$VITE_PUBLIC_MAP_KEY
RUN bun --filter web build

FROM build-db AS build-auth
RUN bun --filter @repo/auth build

FROM build-db AS build-graphql
RUN bun --filter @repo/graphql build

FROM build-db AS build-api-gateway
RUN bun --filter @repo/api-gateway build

# ============================================================================
# Runtime stages — compose `target:` selects one of these
# ============================================================================
FROM nginx:1.27-alpine AS dashboard
COPY --from=build-dashboard /repo/apps/dashboard/dist /usr/share/nginx/html
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM oven/bun:1.2.22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0
# `curl` is for container healthchecks (Coolify/Traefik probes).
RUN apk add --no-cache curl
COPY --from=build-web --chown=bun:bun /repo/apps/web/.output /app/.output
COPY --from=build-web --chown=bun:bun /repo/apps/web/package.json /app/package.json
USER bun
EXPOSE 3000
CMD ["bun", "run", "start"]

FROM oven/bun:1.2.22-alpine AS auth
WORKDIR /app
COPY --from=build-auth /repo /app
WORKDIR /app/apps/backend/auth
ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001
CMD ["bun", "run", "dist/main.js"]

FROM oven/bun:1.2.22-alpine AS graphql
RUN apk add --no-cache vips
WORKDIR /app
COPY --from=build-graphql /repo /app
WORKDIR /app/apps/backend/graphql
ENV NODE_ENV=production
ENV PORT=3002
ENV GRAPHQL_TCP_HOST=0.0.0.0
ENV GRAPHQL_TCP_PORT=4002
EXPOSE 3002 4002
CMD ["bun", "run", "dist/main.js"]

FROM oven/bun:1.2.22-alpine AS api-gateway
WORKDIR /app
COPY --from=build-api-gateway /repo /app
WORKDIR /app/apps/backend/api-gateway
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "dist/main.js"]
