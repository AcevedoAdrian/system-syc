import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthGuard } from "../../common/guards/auth.guard";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";
import { createAuth } from "./auth.config";
import { AUTH } from "./auth.tokens";

@Global()
@Module({
  providers: [
    { provide: AUTH, useFactory: (env: Env) => createAuth(env), inject: [ENV] },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  exports: [AUTH],
})
export class AuthModule {}
