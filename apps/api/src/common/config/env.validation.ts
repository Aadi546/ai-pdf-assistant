import { plainToInstance } from "class-transformer";
import { IsIn, IsOptional, IsString, MinLength, validateSync } from "class-validator";

/**
 * Fail-fast env validation: a missing/malformed required var crashes boot
 * immediately with a clear message, instead of surfacing as a confusing
 * runtime error the first time a request touches that config (spec §46).
 * Vars for modules not built yet are optional here and get promoted to
 * required as each module starts depending on them.
 */
class EnvironmentVariables {
  @IsIn(["development", "test", "production"])
  @IsOptional()
  NODE_ENV?: string;

  @IsString()
  @IsOptional()
  PORT?: string;

  @IsString()
  @IsOptional()
  WEB_ORIGIN?: string;

  @IsString()
  DATABASE_URL!: string;

  @IsString()
  REDIS_URL!: string;

  @IsString()
  @MinLength(32, { message: "JWT_SECRET should be at least 32 chars — try: openssl rand -base64 32" })
  JWT_SECRET!: string;

  @IsString()
  @MinLength(32, {
    message: "JWT_REFRESH_SECRET should be at least 32 chars — try: openssl rand -base64 32",
  })
  JWT_REFRESH_SECRET!: string;

  @IsString()
  STORAGE_ENDPOINT!: string;

  @IsString()
  STORAGE_BUCKET!: string;

  @IsString()
  STORAGE_ACCESS_KEY!: string;

  @IsString()
  STORAGE_SECRET_KEY!: string;

  @IsString()
  @IsOptional()
  STORAGE_REGION?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }

  return validated;
}
