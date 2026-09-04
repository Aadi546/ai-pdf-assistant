import { CanActivate, ExecutionContext, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The ownership check every resource-scoped route needs (spec §23/§47):
 * never trust a client-sent documentId — verify the authenticated user
 * actually owns the row before the controller sees it. Must run after
 * JwtAuthGuard (`@UseGuards(JwtAuthGuard, DocumentOwnerGuard)`, in that
 * order) so req.user is already populated.
 *
 * Returns 404, not 403, for a document owned by someone else — a 403 would
 * confirm the ID exists at all, which is itself information leakage.
 * Attaches the loaded row to `req.document` so the controller doesn't have
 * to fetch it a second time — read it with @CurrentDocument().
 */
@Injectable()
export class DocumentOwnerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const documentId: string | undefined = req.params?.id;
    if (!documentId) {
      throw new NotFoundException("Document not found");
    }

    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document || document.userId !== req.user?.userId) {
      throw new NotFoundException("Document not found");
    }

    req.document = document;
    return true;
  }
}
