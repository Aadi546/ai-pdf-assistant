import { Module } from "@nestjs/common";
import { DocumentOwnerGuard } from "../documents/document-owner.guard";
import { ReadingProgressModule } from "../reading-progress/reading-progress.module";
import { ReadingContextController } from "./reading-context.controller";
import { ReadingContextService } from "./reading-context.service";

@Module({
  imports: [ReadingProgressModule],
  controllers: [ReadingContextController],
  providers: [ReadingContextService, DocumentOwnerGuard],
})
export class ReadingContextModule {}
