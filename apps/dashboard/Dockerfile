# syntax=docker/dockerfile:1.7
# Build context is the repo root (see docker-compose).

# --- builder ----------------------------------------------------------------
FROM oven/bun:1.2.22-alpine AS builder
WORKDIR /repo

ARG VITE_API_URL
ARG VITE_GRAPHQL_WS_URL
ARG VITE_GOOGLE_MAPS_API_KEY
ARG VITE_GOOGLE_MAPS_ID
ENV VITE_API_URL=$VITE_API_URL \
    VITE_GRAPHQL_WS_URL=$VITE_GRAPHQL_WS_URL \
    VITE_GOOGLE_MAPS_API_KEY=$VITE_GOOGLE_MAPS_API_KEY \
    VITE_GOOGLE_MAPS_ID=$VITE_GOOGLE_MAPS_ID

COPY . .
RUN bun install --frozen-lockfile
RUN bun --filter @repo/dashboard build

# --- runtime: nginx serves the static SPA ----------------------------------
FROM nginx:1.27-alpine
COPY --from=builder /repo/apps/dashboard/dist /usr/share/nginx/html
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
