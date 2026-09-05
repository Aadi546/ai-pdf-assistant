import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";
import { AllExceptionsFilter } from "./common/filters/all-exceptions.filter";
import { LoggingInterceptor } from "./common/interceptors/logging.interceptor";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Render terminates TLS in front of the API — without this, Express sees
  // every request as plain HTTP and refuses to set secure: true cookies.
  app.set("trust proxy", 1);

  const rawOrigins = process.env.WEB_ORIGIN ?? "http://localhost:3000";
  const allowedOrigins = rawOrigins
    .split(",")
    .map((o) => o.trim().replace(/\/$/, ""))
    .filter(Boolean);

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/$/, "");
      if (allowedOrigins.includes(normalizedOrigin) || allowedOrigins.includes("*")) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true, // required so the browser sends/receives the refresh-token cookie
  });

  app.use(cookieParser());

  // Order matters: the interceptor wraps every request for latency logging,
  // the filter catches anything that escapes a handler and gives it a safe,
  // consistent shape — see each class's own comment for why.
  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());

  // Strips unknown fields and rejects malformed request bodies before they
  // ever reach a controller — the first line of defense from spec §23/§48.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle("AI PDF Study Companion API")
    .setDescription("REST API for the PDF reading + AI study companion")
    .setVersion("0.1.0")
    .addBearerAuth()
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, swaggerDocument);

  const port = process.env.PORT ? Number(process.env.PORT) : 4000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API listening on http://localhost:${port} (docs at /docs)`);
}

bootstrap();
