import { ApiProperty } from "@nestjs/swagger";
import { IsString, Length } from "class-validator";

export class SetAiConfigDto {
  @ApiProperty({ description: "A Gemini API key from https://aistudio.google.com/apikey", example: "AIzaSy..." })
  @IsString()
  @Length(10, 200)
  apiKey!: string;
}
