# ADR 0002: Auth lives entirely in NestJS, not split with Next.js

## Status
Accepted

## Context
The frontend needs authenticated sessions; a common pattern is to let
Next.js own auth (e.g. NextAuth) and have the API trust a forwarded session.

## Decision
NestJS owns auth end-to-end (Passport + JWT access token + httpOnly-cookie
refresh token). Next.js is just another REST client of the API.

## Reasons
- One source of truth for "who is this request from" — no second session
  system to keep in sync, no risk of the two disagreeing.
- Simpler mental model while learning NestJS: Guards/Strategies live in one
  place and are directly testable.
- Every other client (a future mobile app, voice interface per spec §43)
  can reuse the exact same auth flow without a Next.js middleman.

## Consequences
- Next.js has to manage the access token client-side (in-memory) and rely
  on the API's refresh-token cookie for renewal — slightly more manual than
  a framework-provided auth solution, but avoids the two-systems problem.
