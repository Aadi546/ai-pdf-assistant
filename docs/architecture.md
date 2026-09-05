# AI-Powered PDF Study Companion — Architecture & Roadmap

## Context

The user wants to build a production-quality, scalable web app: an AI study
partner that reads alongside the user through any PDF (not just system-design
books — general purpose: textbooks, papers, docs, notes). The differentiator
vs. a generic "chat with your PDF" tool is a **reading-context subsystem**
that tracks what page/section/selection the user is currently on, so the AI
answers feel situated in the moment, not just RAG-over-a-blob.

The user supplied a very detailed 66-section spec. This plan reviews that
spec, calls out where I'd deviate and why, and locks the concrete design
(folders, schema, API, reading-context protocol, ingestion/RAG pipeline,
scaling story, deployment, phased roadmap) before any code is written.

Project lives at `C:\Users\lenovo\Desktop\ai-pdf-assistant` (renamed from the
original `AI PDF ASSISSTANT(PDF AI)` per ADR 0003 — spaces/parentheses in the
path broke Prisma's CLI tooling in a pnpm workspace). The other working
directory, `...FILE TRANSFER\mobile`, is an unrelated Flutter app and is not
touched by this project.

---

## 1. Architecture Review — where I disagree with the spec

**Vector store: use pgvector, not Redis Vector Search, from day one.**
Redis Stack's vector search needs the RediSearch module, which most managed
Redis providers (Upstash, ElastiCache, Railway's Redis) don't ship — you'd
need a self-hosted Redis Stack container, which fights the "deploy easily to
managed services" goal. Postgres is already in the stack as source of truth,
and pgvector gives real vector search with zero new infra, transactional
consistency with the chunk rows it's attached to (no dual-write problem
between Postgres and Redis for the same data), and an easy migration path to
Qdrant/Pinecone later since we're putting a `VectorStore` interface in front
of it regardless. Redis is still used, just for cache/queue/rate-limit/session,
which is what it's actually good at.

**Auth: NestJS-native (Passport + JWT), not split across Next.js and Nest.**
Keeping one source of truth for auth simplifies the system and is more
teachable. Next.js talks to the API like any other client; access token in
memory, refresh token in an httpOnly cookie set by the API.

**Full-text search: Postgres `tsvector` + GIN index, not a separate search
engine.** Elasticsearch/Meilisearch would be a second system to run and keep
in sync for a feature (exact-phrase search) that Postgres already does well
at this scale.

**Chapter/section detection: heuristic, not guaranteed.** PDFs don't carry
semantic structure. We'll infer sections from font-size/heading heuristics
during extraction (pdf-parse font metadata) with page number as the reliable
fallback unit everywhere. I'll set this expectation now so it isn't a later
surprise: section names will sometimes be wrong or missing, and page number
is always correct — reading context and citations should never depend solely
on section detection.

**BYOK Gemini key: session-scoped only for V1**, exactly as the spec allows.
Stored server-side in Redis keyed by session, encrypted at rest is deferred
to V2 (adds KMS/envelope-encryption complexity not needed to hit the V1
acceptance criteria).

**WebSockets: none in V1.** SSE covers AI streaming; reading-context updates
are plain debounced POSTs. This matches the spec's own "don't add WS
everywhere" instruction — flagging only because the diagram implies a
`WS` line into the backend that we're deliberately not building yet.

**Redis Streams/pub-sub for queue observability**: skip for V1; BullMQ's own
dashboard/API access is enough. Revisit if we add multiple worker types.

Everything else in the spec (modular monolith, pnpm+Turborepo, S3-compatible
storage behind an interface, `AIProvider` interface, RAG with page-bounded
chunking, Prisma/Postgres as source of truth, stateless API) I'm adopting as
specified.

---

## 2. Improved Architecture (confirmed)

```
Browser (Next.js/React/TS, Tailwind, shadcn/ui, react-pdf, TanStack Query, Zustand)
        │ HTTPS (REST) + SSE (AI streaming)
        ▼
NestJS modular monolith (stateless, horizontally scalable)
  Auth · Users · Documents · Ingestion · Retrieval · AI · Chat
  Highlights · Notes · Progress · Storage · Queue · Redis · Health
        │                 │                    │
        ▼                 ▼                    ▼
   PostgreSQL          Redis               S3-compatible
   (+pgvector)     (cache, BullMQ         object storage
   source of       queues, rate           (PDF files)
   truth            limit, session)
        │                 │
        │                 ▼
        │            BullMQ Worker(s)
        │            (extract → chunk → embed → index)
        │                 │
        └─────────────────┘
                  │
                  ▼
            Gemini API (BYOK, abstracted behind AIProvider)
```

Why a modular monolith and not microservices (per spec §29/§61): at V1-V2
scale, one deployable unit is dramatically easier to develop, debug, and
deploy, and NestJS modules already give clean internal boundaries
(`DocumentsModule`, `IngestionModule`, etc. behind interfaces). The moment
ingestion CPU load starts contending with API request latency, the
`IngestionModule`'s worker process is the first thing to split out — because
it already runs as a separate BullMQ worker process, that split is a
deployment change, not a rewrite.

---

## 3. Folder Structure

```
ai-pdf-assistant/
├── apps/
│   ├── web/                      # Next.js
│   │   ├── app/                  # routes: (auth)/, library/, documents/[id]/
│   │   ├── components/           # dumb/presentational UI
│   │   ├── features/             # pdf-reader/, ai-chat/, reading-context/, library/
│   │   ├── hooks/
│   │   ├── lib/                  # api client, query client
│   │   ├── stores/                # zustand stores
│   │   └── types/
│   └── api/                      # NestJS
│       ├── prisma/               # schema.prisma + migrations (moved here from
│       │                         # a root prisma/ per ADR 0003 — pnpm's strict,
│       │                         # non-hoisted node_modules means Prisma's CLI
│       │                         # version-detection only works when the schema
│       │                         # is colocated with the package that depends
│       │                         # on `prisma`/`@prisma/client`)
│       └── src/
│           ├── auth/
│           ├── users/
│           ├── documents/
│           ├── ingestion/        # extraction + chunking orchestration
│           ├── embeddings/
│           ├── retrieval/        # VectorStore interface + pgvector impl
│           ├── ai/               # AIProvider interface + GeminiProvider
│           ├── chat/             # prompt builder, SSE streaming
│           ├── conversations/
│           ├── highlights/
│           ├── notes/
│           ├── progress/
│           ├── storage/          # ObjectStorage interface + S3 impl
│           ├── queue/            # BullMQ setup, worker processors
│           ├── redis/
│           ├── health/
│           └── common/           # guards, interceptors, filters, DTOs base
├── packages/
│   ├── shared/                   # cross-app pure TS (chunking constants, etc.)
│   ├── types/                    # shared DTO/entity types (Document, Message…)
│   └── config/                   # shared eslint/tsconfig
├── docs/
│   ├── architecture.md
│   └── decisions/                # ADRs
├── docker/
│   ├── api.Dockerfile
│   └── web.Dockerfile
├── docker-compose.yml            # postgres+pgvector, redis, minio
├── pnpm-workspace.yaml
├── turbo.json
├── package.json
└── README.md
```
(No `packages/ui` in V1 — one frontend app doesn't need a shared component
package yet; add it if/when a second frontend appears.)

---

## 4. Database Design (Prisma / PostgreSQL)

Core entities, trimmed to what V1+V2 actually need:

- **User** — id, email, passwordHash, name, createdAt
- **Document** — id, userId(FK), title, originalFilename, storageKey, sizeBytes,
  pageCount, status(`UPLOADING|PROCESSING|EMBEDDING|READY|FAILED`),
  failureReason, createdAt, updatedAt. Index: `(userId, createdAt)`.
- **DocumentChunk** — id, documentId(FK), pageNumber, chapter?, section?,
  chunkIndex, text, embedding(`vector(768)`, pgvector column), createdAt.
  Index: `(documentId, pageNumber)`, ivfflat/HNSW index on `embedding`.
  (No separate `DocumentPage` table in V1 — page text is derivable from its
  chunks; adding a dedicated page-text cache is a V2 optimization if raw
  page lookups get hot.)
- **Conversation** — id, userId(FK), documentId(FK), title?, summary?
  (rolling summary for chat-memory compaction), createdAt, updatedAt.
  Index: `(documentId, userId)`.
- **Message** — id, conversationId(FK), role(`USER|ASSISTANT`), content,
  citedPages(int[]), createdAt. Index: `(conversationId, createdAt)`.
- **ReadingProgress** — id, userId(FK), documentId(FK) **unique together**,
  currentPage, progressPercent, lastReadAt.
- **Highlight** — id, userId(FK), documentId(FK), pageNumber, text,
  position(JSON: rects), createdAt. Index: `(documentId, pageNumber)`.
- **Note** — id, userId(FK), documentId(FK), pageNumber?, highlightId?,
  content, createdAt, updatedAt. Full-text index (`tsvector`) on `content`.
- **UserAIConfig** — userId(FK) unique, provider(`GEMINI`), encryptedApiKey?
  (nullable — V1 keeps the key in Redis session only, this column exists for
  the V2 "remember my key" opt-in), updatedAt.
- **AIUsage** — id, userId(FK), documentId?, tokensIn, tokensOut, latencyMs,
  createdAt. For cost/rate-limit visibility, not billing (BYOK).

All FKs cascade-delete from `Document`/`User` where it's clearly owned data
(chunks, highlights, notes, progress). Every table that's queried by
`userId`/`documentId` gets a composite index on that pair — these are the two
filters every single query in this app applies.

---

## 5. API Design (REST, NestJS, Swagger-documented)

```
POST   /auth/register
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout

GET    /documents                       # library list, paginated
POST   /documents                       # multipart upload -> {id, status: PROCESSING}
GET    /documents/:id
DELETE /documents/:id
GET    /documents/:id/status            # cheap poll target while processing
GET    /documents/:id/file              # signed URL / stream for PDF.js

POST   /documents/:id/reading-context   # debounced context updates (page/selection)
POST   /documents/:id/chat              # SSE stream: question + current context

GET    /conversations?documentId=
POST   /conversations
GET    /conversations/:id
DELETE /conversations/:id

POST   /highlights
GET    /documents/:id/highlights
DELETE /highlights/:id

POST   /notes
GET    /documents/:id/notes
PATCH  /notes/:id
DELETE /notes/:id

GET    /documents/:id/reading-progress
PUT    /documents/:id/reading-progress

POST   /ai/config                       # set session-scoped Gemini key
GET    /ai/config/status                # {configured: boolean} — never returns the key

GET    /health
GET    /health/queue
```

Deviations from the spec's list: dropped `GET /documents/:id/pages/:page` as
its own endpoint (page text is served as part of chat context internally,
not a public read path — the frontend renders pages from the PDF file
itself via PDF.js, not from extracted text); added `/status` for cheap
polling and `/reading-context` as the dedicated context-update endpoint
called out in §7-8; added `/ai/config/status` so the frontend can check key
presence without ever getting the key back.

Every `:id`-scoped route runs an ownership guard (`documentId` → does
`req.user.id === document.userId`) — enforced in a NestJS guard, not
per-controller, so it can't be forgotten on a new route.

---

## 6. Reading Context Design

Client-side state machine (Zustand store `useReadingContext`), server only
hears about **meaningful** changes:

```
scroll/page event (react-pdf onPageChange + IntersectionObserver
                    for "which page is >50% visible")
        │
        ▼
  update local store immediately (UI needs this instantly)
        │
        ▼
  debounce 800ms + compare to last-sent page
        │
        ▼
  page changed?  ──no──▶ drop, no network call
        │yes
        ▼
  POST /documents/:id/reading-context
  { currentPage, previousPage, sessionId }
        │
        ▼
  API upserts Redis key  reading_context:{userId}:{documentId}
  (TTL 30min, this is ephemeral session state — not the ReadingProgress
   table, which is only written on page-unload/interval for the
   "continue where you left off" feature)
```

Text selection is a separate, **immediate** (non-debounced) local event: it
doesn't hit the network on its own — it's attached to the *next* chat
message as `selectedText`, matching the priority order in spec §50. This
avoids a network call per selection while still making selection
first-class context the instant the user asks something.

`/documents/:id/chat` request body:
```ts
{ question: string, currentPage: number, selectedText?: string }
```
The backend does not trust a client-sent `documentId: X, chunks: [...]` —
only `documentId` from the URL, `currentPage`/`selectedText` from the body;
everything else (retrieved chunks, conversation history, summary) is
resolved server-side from the DB/vector store, never from the client.

---

## 7. PDF Ingestion / RAG Pipeline

```
POST /documents (multipart)
   │  validate: mimetype=application/pdf, ext=.pdf, size<=50MB
   ▼
store PDF in object storage → Document row (status=UPLOADING) → status=PROCESSING
   │
   ▼  enqueue BullMQ job {documentId}, return 202 immediately
   │
Worker process:
   1. download PDF from storage
   2. extract per-page text (pdf-parse), heuristic heading detection for section/chapter
   3. chunk PER PAGE first, then split any page whose text exceeds ~500 tokens
      into overlapping sub-chunks (~100-token overlap) — never chunk across
      a page boundary, so every chunk keeps one accurate pageNumber
   4. batch-embed chunks (Gemini embedding model), write DocumentChunk rows
      (text + embedding) in batches — job is idempotent: reprocessing a
      documentId deletes-then-reinserts its chunks rather than appending
   5. status=READY (or FAILED with failureReason, chunks rolled back)
   │
Frontend polls GET /documents/:id/status → Uploading → Processing → Embedding → Ready
```

Retrieval at chat time (`ai/retrieval` module, behind a `VectorStore`
interface so pgvector → Qdrant/Pinecone is a swap, not a rewrite):
1. embed the question
2. always include: chunks for `currentPage` (± 1 page)
3. top-K (e.g. 5) semantic matches from pgvector cosine search
4. if `selectedText` present, prepend it as highest-priority, unretrieved
   context (spec §50 order: selection → current page → nearby → retrieved → history)
5. prompt builder (`ai/prompt-builder.ts`, the single place prompts get
   assembled — per spec §49) composes: system instructions + reading context
   + selection + retrieved chunks (each tagged with its page number, so the
   model can cite `[Page N]`) + last N messages + rolling conversation
   summary + question
6. `AIProvider.stream()` → Gemini → SSE to client
7. citations are just `[Page N]` markers the model is instructed to emit;
   frontend regexes them into clickable buttons that call the existing
   "jump to page" PDF.js API — no extra backend citation-tracking needed for V1

---

## 8. Scalability Strategy

| Stage | Trigger | Change |
|---|---|---|
| 1 | V1 launch | Single NestJS instance + 1 worker process, modular monolith |
| 2 | Ingestion backs up API latency | Run the worker(s) as their own deployed process(es) (already separate BullMQ consumers — just point them at their own dyno/container). Embedding (`EmbeddingProcessor`, its own `embedding` queue) is the one most likely to actually trigger this stage: it's the long-running, IO-bound member of the pair — extraction is a short CPU burst — and it's written to move as-is, unchanged, per ADR 0007. |
| 3 | API CPU/latency under load | Scale NestJS horizontally behind a load balancer — safe because it's stateless (session in Redis, no in-memory reading-context) |
| 4 | Vector search latency grows | Tune pgvector index (HNSW), or swap `VectorStore` impl to Qdrant — interface makes this a config change, not an app rewrite |
| 5 | Chat volume high | Add Redis caching for repeated-question embeddings; consider a dedicated retrieval service only if it's genuinely CPU/IO-bound separately from the API |
| 6 | Very large scale | Read replicas for Postgres; move chunk storage to a purpose-built vector DB regardless of query volume, for operational isolation from OLTP tables |

Concrete "what happens at N users" for the pieces the spec asked to be
taught (kept short; expand per-topic during the relevant implementation
phase rather than all at once here):
- **Redis (queue+cache+session)**: at 100 users, one Redis instance handles
  everything with room to spare. At 10k users, split queue Redis from
  cache/session Redis so a queue backlog can't evict session data. At 1M,
  Redis Cluster / managed Redis with its own capacity planning per use case.
- **Postgres indexes**: at 100 users, no indexing questions matter. At 10k,
  `(userId, documentId)` composite indexes are what keep dashboard/library
  queries fast. At 1M, read replicas + partitioning `DocumentChunk` by
  document age/access pattern.
- **Stateless API**: at 100 users irrelevant. At 10k, this is *why* you can
  add a second instance without a sticky-session hack. At 1M, this is why
  autoscaling groups work at all.

---

## 9. Deployment Strategy

- **Dev**: `docker-compose.yml` → Postgres (pgvector image), Redis, MinIO
  (S3-compatible). `pnpm install && docker compose up -d && pnpm dev` starts
  `apps/web` + `apps/api` (+ worker) via Turborepo.
- **Prod (initial)**: Next.js → Vercel. NestJS API + worker → Railway/Render/
  Fly.io (two processes from the same image, different start commands).
  Postgres → Neon/Supabase (pgvector supported on both). Redis → Upstash.
  Object storage → Cloudflare R2 (S3-compatible, cheap egress).
- Nothing is vendor-locked: `StorageModule` reads `STORAGE_ENDPOINT` etc. and
  talks S3 protocol to whatever's behind it; same pattern for every external
  service.

---

## 10. Phased Development Roadmap

Matches spec §59, V1 scope only (§40) — V2/V3 items explicitly deferred:

0. Architecture (this document) ✅
1. Monorepo + dev environment (pnpm, Turborepo, docker-compose, empty Next.js + NestJS apps booting)
2. Auth + Users (register/login/refresh, ownership guard groundwork)
3. PDF upload + storage (multer → StorageModule → S3/MinIO, Document row + status)
4. PDF viewer (react-pdf rendering, page nav, zoom, basic search-in-PDF)
5. Reading context (page-change detection, debounce, `/reading-context` endpoint, Redis-backed context)
6. Ingestion pipeline (BullMQ, text extraction, page-bounded chunking)
7. Embeddings + pgvector retrieval (VectorStore interface, semantic search)
8. Gemini AIProvider (BYOK key capture, `AIProvider` interface, embed+generate)
9. Chat + SSE streaming (prompt builder, chat endpoint, streaming UI)
10. RAG + citations (retrieval wired into prompt builder, `[Page N]` → clickable jump)
11. Reading progress (persist/restore "continue from page N")
12. Testing + observability (unit/integration tests for the above, structured logging, health checks)
13. Deployment (Dockerfiles, deploy to the stack above)

Each phase ships working, demoable code before the next starts, per the
spec's explicit instruction — no phase jumps ahead of what V1 needs.

---

## Verification approach (per phase, once implementation starts)

- Backend: `pnpm --filter api test` (unit) + a small integration suite
  hitting a test Postgres/Redis via docker-compose.
- Frontend: component tests for the PDF reader and chat UI; manual
  verification in the Browser preview tool for each phase's user-facing
  slice (e.g. phase 4 → actually open a PDF and page through it; phase 9 →
  actually watch a streamed response render).
- End of V1: walk the full spec §65 acceptance-criteria list (upload → read
  → select → ask → stream → cite → jump → progress persists across reload)
  manually in the browser preview as the final V1 sign-off.
