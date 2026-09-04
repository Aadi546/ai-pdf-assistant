# AI PDF Study Companion

An AI-powered study partner that reads alongside you through any PDF —
textbooks, papers, docs, lecture notes — and stays aware of what page,
section, or selected text you're currently looking at.

Full architecture writeup: [docs/architecture.md](docs/architecture.md).

## Tech stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS, react-pdf, TanStack Query, Zustand
- **Backend**: NestJS, TypeScript, REST + SSE, Swagger
- **Database**: PostgreSQL + Prisma + pgvector (vector search, swappable later)
- **Cache/Queue**: Redis + BullMQ
- **Storage**: S3-compatible object storage (MinIO locally, R2/S3 in prod)
- **AI**: Gemini API, BYOK (bring your own key), behind an `AIProvider` interface

## Prerequisites

- Node.js 20+
- pnpm (`npm install -g pnpm` if you don't have it)
- Docker Desktop (for Postgres/Redis/MinIO in dev)

## Getting started

```bash
pnpm install
docker compose up -d
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
pnpm db:generate
pnpm db:migrate
pnpm dev
```

This starts:
- Next.js at http://localhost:3000
- NestJS API at http://localhost:4000 (Swagger docs at `/docs`)
- Postgres (with pgvector) at `localhost:5432`
- Redis at `localhost:6380` (not the default 6379 — see docker-compose.yml)
- MinIO at `localhost:9000` (console at `localhost:9001`, both `minioadmin`/`minioadmin`)

Run just one app: `pnpm dev:web` or `pnpm dev:api`.

## Environment variables

See `apps/api/.env.example` and `apps/web/.env.example`. Never commit a
real `.env` file. The server never stores a user's Gemini API key as an env
var — that key is BYOK and session-scoped (see architecture doc, §BYOK).

## Testing

```bash
pnpm test        # all workspaces
pnpm --filter api test
```

## Project structure

```
apps/
  web/        Next.js frontend
  api/        NestJS backend
    prisma/   Prisma schema + migrations (source of truth for the DB)
packages/
  shared/     cross-app constants/utilities
  types/      shared TypeScript types (API contracts)
  config/     shared tsconfig bases
docs/         architecture docs + ADRs
docker/       Dockerfiles for prod images
```

## Development approach

Built in phases — see [docs/architecture.md](docs/architecture.md) §10 for
the full roadmap. Each phase ships a working, demoable slice before the
next begins.

## Observability

- `GET /health` — liveness, no dependency checks, always fast
- `GET /health/ready` — readiness, pings Postgres and Redis, 503 if either is down
- Every request logs one structured JSON line (`{requestId, userId, method, path, statusCode, latencyMs}`) — never a request body, a token, or a Gemini key
- Every response carries an `X-Request-Id` header (echoes a client-supplied one, generates one otherwise) for correlating a client-side error report with a server log line
- All errors funnel through one global exception filter — a client never sees a raw stack trace or an internal error message, only a safe, consistent `{statusCode, message, requestId}` shape

## Scaling strategy

Starts as a modular monolith (NestJS) with a stateless API tier, Postgres as
the single source of truth, Redis for cache/queue/session, and object
storage for files — see [docs/architecture.md](docs/architecture.md) §8 for
the stage-by-stage plan for when to split out workers, scale the API
horizontally, or swap the vector store.
