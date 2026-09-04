import { Module } from "@nestjs/common";
import { DocumentOwnerGuard } from "../documents/document-owner.guard";
import { ReadingProgressController } from "./reading-progress.controller";
import { ReadingProgressService } from "./reading-progress.service";

@Module({
  controllers: [ReadingProgressController],
  providers: [ReadingProgressService, DocumentOwnerGuard],
  exports: [ReadingProgressService],
})
export class ReadingProgressModule {}
