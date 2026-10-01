import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env.schema";
import type { Auth } from "./modules/auth/auth.config";
import { mountAuth } from "./modules/auth/auth.handler";
import { AUTH } from "./modules/auth/auth.module";

async function bootstrap() {
  const env = loadEnv(process.env);
  // Sin body parser propio: Better Auth lee el cuerpo del stream, así que se monta antes del JSON.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  mountAuth(app, app.get<Auth>(AUTH));
  app.useBodyParser("json");
  await app.listen(env.API_PORT);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
