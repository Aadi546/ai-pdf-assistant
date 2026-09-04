import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export interface RequestUser {
  userId: string;
  email: string;
}

/**
 * Pulls the authenticated user off the request inside a controller method,
 * e.g. `whoAmI(@CurrentUser() user: RequestUser)`. Only ever populated on
 * routes behind JwtAuthGuard — this is the building block every later
 * ownership check (Document, Highlight, Note, ...) will compare a resource's
 * userId against.
 */
export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
