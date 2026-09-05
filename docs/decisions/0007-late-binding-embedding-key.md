# ADR 0007: Late-bind the Gemini key in the embedding worker, don't snapshot it

## Status
Accepted

## Context
Embedding was originally triggered lazily on a user's first chat message,
not in the ingestion worker where extraction/chunking happen — because the
worker runs asynchronously (at upload time, well before a user might enter
their Gemini key) and the key is BYOK: session-scoped in Redis with a 24h
TTL (`AiKeyService`), never persisted, never an env var. A worker firing at
upload time has no guarantee a key exists yet.

That placement made the first chat message on any newly-uploaded document
do the entire embedding pass synchronously inside the SSE request handler —
on a large PDF, minutes of blocking work with a single "indexing…" status
event as the only feedback, and no resumption if the tab closed mid-pass.

Fixing this means moving embedding into the background worker where it
belongs. The open question was how that worker gets a key it has no
guarantee exists.

## Options considered
1. **Snapshot the key into the BullMQ job payload at enqueue time.** Works
   if a key already exists when the document is uploaded, but is
   structurally incapable of handling a user who uploads before ever
   entering a key — there's nothing to snapshot. It also duplicates the
   secret into `bull:*` job hashes, which under `removeOnFail` persist with
   no TTL of their own — a second, uncontrolled place the key can leak from,
   and a direct contradiction of the "session-scoped, never persisted"
   design this whole subsystem exists to uphold.
2. **Late-bind: the worker resolves the key itself, each time it needs one,
   and treats a missing key as a park rather than a failure.**

## Decision
Late-bind. `EmbeddingProcessor` calls `AiKeyService.getKey(userId)` once per
persistence iteration (not once per job) rather than ever receiving a key as
job data. If no key is found, the job logs and returns normally — no
`FAILED`, no attempt consumed, the document just stays at `EMBEDDING`.

Three triggers keep documents from staying parked once a key does exist:
- `AiConfigService.setKey` re-enqueues every `EMBEDDING` document for that
  user right after the key validates.
- `ChatService.assertCanChat` enqueues defensively on any preflight hit
  against an `EMBEDDING` document — covers the case where the container was
  asleep when the key was set.
- Re-reading the key every iteration (rather than once at job start) means a
  key entered *mid-job* is picked up on the very next iteration, and a key
  that expires or gets cleared mid-job parks the job with whatever progress
  already committed, instead of crashing.

All three enqueues share one deterministic `jobId: embed:${documentId}`
(`IngestionScheduler`), so none of them can produce duplicate concurrent
jobs for the same document.

## Consequences
- A document uploaded by a user with no key sits at `EMBEDDING` indefinitely
  until they add one — this is now surfaced explicitly rather than
  discovered by trying to chat: `GET /documents/:id/status` computes
  `needsApiKey` live (`!aiConfigService.hasKey(userId)`), not as a stored
  enum value, since a key can arrive at any instant and a stored "waiting"
  state would be wrong the moment it was written.
- Resumability is what makes retrying an embed job safe at all:
  `listUnembeddedChunks`/`countEmbedded` (raw SQL against the pgvector
  `embedding IS NULL` column) mean "what's left to do" is a query, not
  worker-side bookkeeping — a job that dies at chunk 200 of 500 resumes at
  chunk 200, not from zero.
- The key is never at rest anywhere the extraction/embedding pipeline
  doesn't already touch it (Redis, 24h TTL, exactly as before) — this ADR
  changes *when* it's read, not *where* it lives.
