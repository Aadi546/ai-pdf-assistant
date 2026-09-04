# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
# Prisma's query engine needs OpenSSL on Alpine (musl) — a well-known gap in
# the base image, not optional. Without this the app crashes on first query.
RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter api exec prisma generate
# turbo, not a plain `pnpm --filter api build` — the api package's own build
# script doesn't know about its workspace dependencies; turbo reads
# turbo.json's `dependsOn: ["^build"]` and builds @ai-pdf/shared and
# @ai-pdf/types first, same as `pnpm dev` already relies on locally.
RUN pnpm exec turbo run build --filter=api

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo
COPY --from=build /repo/apps/api/dist ./apps/api/dist
COPY --from=build /repo/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /repo/node_modules ./node_modules
COPY --from=build /repo/apps/api/prisma ./apps/api/prisma
COPY --from=build /repo/packages ./packages
EXPOSE 4000
# migrate deploy first — a fresh managed Postgres (Render/Supabase/etc.) has
# no schema until this runs; safe to run on every boot since it's a no-op
# once migrations are already applied.
CMD ["sh", "-c", "cd apps/api && npx prisma migrate deploy && cd /repo && node apps/api/dist/main.js"]
