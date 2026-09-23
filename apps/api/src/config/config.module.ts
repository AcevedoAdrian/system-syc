import { Global, Module } from "@nestjs/common";
import { type Env, loadEnv } from "./env.schema";

export const ENV = Symbol("ENV");

@Global()
@Module({
  providers: [{ provide: ENV, useFactory: (): Env => loadEnv(process.env) }],
  exports: [ENV],
})
export class ConfigModule {}
