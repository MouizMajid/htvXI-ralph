# Build context: repo root. Builds the SPA, then serves it from Caddy (which also proxies /api).
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
RUN pnpm install --frozen-lockfile --filter @ralph/web...
RUN pnpm --filter @ralph/web build

FROM caddy:2
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
