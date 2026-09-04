import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsInt, IsOptional, IsUUID, Max, Min } from "class-validator";

export class ListDocumentsQueryDto {
  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  take: number = 20;

  @ApiPropertyOptional({ description: "Document id to page after (cursor pagination)" })
  @IsOptional()
  @IsUUID()
  cursor?: string;
}
