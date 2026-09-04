import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

/**
 * Attach with `@UseGuards(JwtAuthGuard)` on any controller/route that
 * requires a logged-in user. Delegates to JwtStrategy above; on success
 * `req.user` is populated, on failure it throws 401 automatically.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {}
