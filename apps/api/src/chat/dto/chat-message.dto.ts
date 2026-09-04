import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsOptional, IsString, Min, MinLength, MaxLength } from "class-validator";

export class ChatMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 2000, example: "Why do we need virtual nodes?" })
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  question!: string;

  @ApiProperty({ minimum: 1, example: 42 })
  @IsInt()
  @Min(1)
  currentPage!: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  selectedText?: string;
}
