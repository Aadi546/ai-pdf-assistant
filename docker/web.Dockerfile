# syntax=docker/dockerfile:1
# Only needed if self-hosting the frontend instead of Vercel.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/config/package.json packages/config/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
# turbo, not a plain `pnpm --filter web build` — see api.Dockerfile's same
# comment: web depends on @ai-pdf/types' built dist/, which only turbo's
# `dependsOn: ["^build"]` graph builds first automatically.
RUN pnpm exec turbo run build --filter=web

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /repo/apps/web
COPY --from=build /repo/apps/web/.next ./.next
COPY --from=build /repo/apps/web/public ./public
COPY --from=build /repo/apps/web/package.json ./package.json
COPY --from=build /repo/node_modules ../../node_modules
COPY --from=build /repo/packages ../../packages
EXPOSE 3000
CMD ["pnpm", "start"]
