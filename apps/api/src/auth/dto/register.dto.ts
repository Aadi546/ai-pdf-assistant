import { ApiProperty } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {
  @ApiProperty({ example: "student@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, example: "correct-horse-battery-staple" })
  @IsString()
  @MinLength(8)
  @MaxLength(72) // bcrypt silently truncates beyond 72 bytes — reject earlier instead
  password!: string;

  @ApiProperty({ required: false, example: "Ada" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
