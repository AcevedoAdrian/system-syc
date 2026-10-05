import { Global, Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DEPARTMENT_READER } from "../../common/department-reader";
import { AuthGuard } from "../../common/guards/auth.guard";
import { PermissionsGuard } from "../../common/guards/permissions.guard";
import { ENV } from "../../config/config.module";
import type { Env } from "../../config/env.schema";
import { AuditModule } from "../audit/audit.module";
import { AuditService } from "../audit/audit.service";
import { createAuth } from "./auth.config";
import { AuthRepository } from "./auth.repository";
import { AUTH } from "./auth.tokens";
import { auditPasswordChanged } from "./auth-audit";

@Global()
@Module({
  imports: [AuditModule],
  providers: [
    {
      provide: AUTH,
      useFactory: (env: Env, audit: AuditService) =>
        createAuth(env, { onPasswordChanged: auditPasswordChanged(audit) }),
      inject: [ENV, AuditService],
    },
    AuthRepository,
    { provide: DEPARTMENT_READER, useExisting: AuthRepository },
    // El orden importa: primero se autentica, después se autoriza.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AUTH],
})
export class AuthModule {}
