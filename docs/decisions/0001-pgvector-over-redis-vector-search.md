# ADR 0001: Use pgvector instead of Redis Vector Search

## Status
Accepted

## Context
The initial spec suggested Redis Stack / Redis Vector Search for the
embedding index, with an explicit requirement that the vector store be
swappable later (pgvector, Qdrant, Pinecone, Weaviate).

## Decision
Use **pgvector** (Postgres extension) as the initial `VectorStore`
implementation instead of Redis Vector Search.

## Reasons
- Redis vector search needs the RediSearch module, which most managed Redis
  providers (Upstash, ElastiCache, Railway) don't provide — self-hosting
  Redis Stack fights the "deploy to managed services easily" goal.
- Postgres is already the source of truth; storing embeddings alongside
  `DocumentChunk` rows avoids a dual-write consistency problem between two
  databases holding the same logical data.
- A `VectorStore` interface sits in front of it either way, so swapping to
  Qdrant/Pinecone later is a config + adapter change, not an app rewrite.
- Redis remains in the stack for what it's actually best at: cache, BullMQ
  queues, rate limiting, and session-scoped BYOK key storage.

## Consequences
- One fewer moving piece in local dev and prod (no separate vector DB to run).
- Vector query performance is coupled to Postgres until/unless we migrate;
  acceptable at V1-V2 scale, revisited per the scalability strategy in
  docs/architecture.md §8 if it becomes a bottleneck.
