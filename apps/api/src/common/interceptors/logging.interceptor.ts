import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, tap } from "rxjs";

/**
 * One structured JSON log line per request — spec §54's shape
 * ({requestId, userId, operation, latency, status}), and deliberately
 * nothing more: never the request body (could contain a password, an AI
 * prompt with private document content, or — before Phase 8 — literally a
 * Gemini API key), never response payloads. An Interceptor wraps the whole
 * handler call, which is what makes measuring latency here possible; a
 * middleware only sees the request on the way in.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger("HTTP");

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap({
        next: () => this.log(req, res, startedAt),
        error: () => this.log(req, res, startedAt),
      }),
    );
  }

  private log(req: Request, res: Response, startedAt: number) {
    this.logger.log(
      JSON.stringify({
        requestId: res.locals.requestId,
        userId: (req as Request & { user?: { userId: string } }).user?.userId ?? null,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        latencyMs: Date.now() - startedAt,
      }),
    );
  }
}
