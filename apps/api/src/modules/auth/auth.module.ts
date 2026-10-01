import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DEPARTMENT_READER } from "../../common/department-reader";
import { AuthGuard } from "../../common/guards/auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";
import { createAuth } from "./auth.config";
import { AuthRepository } from "./auth.repository";
import { AUTH } from "./auth.tokens";

@Global()
@Module({
  providers: [
    { provide: AUTH, useFactory: (env: Env) => createAuth(env), inject: [ENV] },
    AuthRepository,
    { provide: DEPARTMENT_READER, useExisting: AuthRepository },
    // El orden importa: primero se autentica, después se autoriza.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AUTH],
})
export class AuthModule {}
