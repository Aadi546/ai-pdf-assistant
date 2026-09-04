import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { Document } from "@prisma/client";

/** Only valid on routes behind DocumentOwnerGuard, which populates req.document. */
export const CurrentDocument = createParamDecorator((_: unknown, ctx: ExecutionContext): Document => {
  const request = ctx.switchToHttp().getRequest();
  return request.document;
});
