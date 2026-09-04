import { randomUUID } from "node:crypto";
import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";

const REQUEST_ID_HEADER = "x-request-id";

/**
 * Runs before guards/interceptors (middleware is the earliest hook in
 * Nest's request lifecycle) so a request ID exists even for requests that
 * never reach a handler — a 401 from a bad token still gets one, which
 * matters for correlating it with anything logged about that request.
 * Reuses an inbound X-Request-Id if a client/proxy already set one
 * (standard practice for tracing a request across services), otherwise
 * generates one.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req.headers[REQUEST_ID_HEADER] as string | undefined) || randomUUID();
    res.locals.requestId = requestId;
    res.setHeader("X-Request-Id", requestId);
    next();
  }
}
