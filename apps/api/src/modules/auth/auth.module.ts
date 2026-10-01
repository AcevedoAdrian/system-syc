import { Global, Module } from "@nestjs/common";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";
import { createAuth } from "./auth.config";

export const AUTH = Symbol("AUTH");

@Global()
@Module({
  providers: [{ provide: AUTH, useFactory: (env: Env) => createAuth(env), inject: [ENV] }],
  exports: [AUTH],
})
export class AuthModule {}
