# Deployment

Two paths: managed services (least ops work) or a single Docker Compose
host (fewest accounts, most control). Both use the same Docker images.

## Before either path

1. **Database migrations use `migrate deploy`, not `migrate dev`.** `dev`
   is interactive and can prompt; `deploy` applies pending migrations
   non-interactively and is what CI/CD and production should always run:
   ```bash
   pnpm --filter api exec prisma migrate deploy
   ```
2. **Generate real secrets** — never reuse a local dev `.env` value:
   ```bash
   openssl rand -base64 32   # run twice: JWT_SECRET, JWT_REFRESH_SECRET
   ```
3. **Object storage bucket**: the app auto-creates its bucket on boot in
   dev (convenience for MinIO) but in production the bucket is expected to
   already exist — create it in R2/S3 first.
4. Set `NODE_ENV=production` — this flips the refresh-token cookie to
   `secure: true` (HTTPS-only) in `apps/api/src/auth/auth.controller.ts`.
   **If the API sits behind a reverse proxy that terminates TLS**
   (Railway, Render, Fly.io, and R2/Nginx setups all do this), Express
   needs to trust the proxy's `X-Forwarded-Proto` header or it will think
   every request is plain HTTP and refuse to set the secure cookie — add
   `app.set("trust proxy", 1)` in `main.ts` before `app.listen()` if you
   hit silent login failures in production.

## Path A — Managed services (matches docs/architecture.md §9)

| Piece | Service | Notes |
|---|---|---|
| Frontend | [Vercel](https://vercel.com) | Import the repo, set root directory to `apps/web`, framework preset Next.js. Set `NEXT_PUBLIC_API_URL` to the deployed API's URL. |
| API + worker | [Railway](https://railway.app) / Render / Fly.io | Build from `docker/api.Dockerfile`. Runs both the HTTP server and the BullMQ ingestion worker in one process (see docs/architecture.md §8 stage 2 for when to split them). |
| Database | [Neon](https://neon.tech) / Supabase | Both support the `vector` extension pgvector needs — enable it: `CREATE EXTENSION IF NOT EXISTS vector;` (Prisma's migration already does this via `extensions = [vector]` in schema.prisma, but confirm the plan/tier allows extensions). |
| Redis | [Upstash](https://upstash.com) | Any Redis-compatible `REDIS_URL` works — BullMQ needs a real TCP connection (not Upstash's REST API), use their "Redis" connection string, not the REST URL. |
| Object storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) | S3-compatible — set `STORAGE_ENDPOINT` to the R2 endpoint, `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` to an R2 API token. |

Set every variable from `apps/api/.env.example` on the API host's env
config, and `NEXT_PUBLIC_API_URL` on Vercel. Run `prisma migrate deploy`
once against the production `DATABASE_URL` before first traffic (most
platforms let you run a one-off command, or run it locally with the prod
connection string).

## Path B — Single Docker Compose host

For a VPS (any provider) instead of four separate SaaS signups. Build
both images and run everything — Postgres, Redis, MinIO (or point
`STORAGE_*` at a real S3-compatible bucket instead), the API, and the
web app — via `docker-compose.yml` plus the two Dockerfiles under
`docker/`. This is the lower-ops-count option at the cost of managing one
host's uptime/backups yourself instead of offloading that to managed
providers.

```bash
docker build -f docker/api.Dockerfile -t ai-pdf-api .
docker build -f docker/web.Dockerfile -t ai-pdf-web .
```

Run them alongside the existing `docker-compose.yml` services (add `api`
and `web` service entries pointing at these images, with real secrets in
their `environment:` block — don't reuse the dev-only compose values).

## CI

`.github/workflows/ci.yml` runs typecheck + test + build on every push —
this is what should gate a deploy, whichever path you pick.
