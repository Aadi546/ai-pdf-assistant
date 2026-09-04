import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * Every unhandled error in the app funnels through here, so there is
 * exactly one place deciding what a client is allowed to see. A thrown
 * HttpException (BadRequestException, NotFoundException, ...) already has
 * a safe, intentional message — pass it through. Anything else (a Prisma
 * error, a bug) is logged in full server-side but the client gets a generic
 * 500, never the raw error — that raw message could be a SQL fragment, a
 * file path, or (pre-Phase-8) something with a Gemini key in it.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("ExceptionFilter");

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = res.locals?.requestId;

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      res.status(status).json(typeof body === "string" ? { message: body, requestId } : { ...body, requestId });
      return;
    }

    this.logger.error(
      JSON.stringify({
        requestId,
        method: req.method,
        path: req.originalUrl,
        error: exception instanceof Error ? exception.message : String(exception),
      }),
      exception instanceof Error ? exception.stack : undefined,
    );

    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: "Something went wrong.",
      requestId,
    });
  }
}
