# ADR 0003: Prisma schema lives in apps/api/prisma, not a root prisma/

## Status
Accepted

## Context
The original plan put `prisma/schema.prisma` at the monorepo root, on the
reasoning that Postgres is a shared source of truth and the schema isn't
conceptually "owned" by one app.

In practice, with pnpm's strict (non-hoisted) `node_modules`, Prisma's CLI
does its "is the right CLI version installed" check by resolving modules
starting from the schema file's own directory. A root-level `prisma/`
folder has no `node_modules` of its own, so that resolution always failed —
Prisma then tried to self-heal by running `pnpm add prisma -D` at the
workspace root, which pnpm blocks by default (`ERR_PNPM_ADDING_TO_ROOT`),
so every `prisma generate` / `migrate dev` call failed outright.

## Decision
Move the schema and migrations to `apps/api/prisma/`, where `prisma` and
`@prisma/client` are actual declared dependencies of that package.

## Consequences
- `prisma generate`/`migrate` now resolve correctly with no workaround.
- Only `apps/api` uses Prisma directly in this project (per the architecture,
  the ingestion worker is planned to run inside the same NestJS codebase),
  so "owned by api" is accurate, not just a technical workaround.
- Root `pnpm db:generate` / `db:migrate` / `db:studio` scripts are unaffected
  — they already ran via `pnpm --filter api exec prisma ...`, which cds into
  `apps/api` before invoking the CLI.
