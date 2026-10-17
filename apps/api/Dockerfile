# Build context: repo root
FROM node:22-slim
WORKDIR /app
RUN corepack enable
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile --filter @ralph/api...
ENV NODE_ENV=production
EXPOSE 3001
CMD ["pnpm", "--filter", "@ralph/api", "start"]
