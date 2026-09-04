import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Min, MaxLength } from "class-validator";

export class UpdateReadingContextDto {
  @ApiProperty({ minimum: 1, example: 42 })
  @IsInt()
  @Min(1)
  currentPage!: number;

  @ApiPropertyOptional({ description: "Currently highlighted/selected text, if any", maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  selectedText?: string;
}
