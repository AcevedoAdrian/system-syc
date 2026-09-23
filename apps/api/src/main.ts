import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { loadEnv } from "./config/env.schema";

async function bootstrap() {
  const env = loadEnv(process.env);
  const app = await NestFactory.create(AppModule);
  await app.listen(env.API_PORT);
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
