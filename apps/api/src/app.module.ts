import { Module } from "@nestjs/common";
import { ORPCModule } from "@orpc/nest";
import { logUnexpectedErrors } from "./common/log-unexpected-errors";
import { ConfigModule } from "./config/config.module";
import { AuditModule } from "./modules/audit/audit.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CatalogsModule } from "./modules/catalogs/catalogs.module";
import { HealthModule } from "./modules/health/health.module";
import { OrganizationsModule } from "./modules/organizations/organizations.module";
import { TicketsModule } from "./modules/tickets/tickets.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    // Config global de oRPC: deja en el log los errores inesperados que él mismo convierte en 500.
    ORPCModule.forRoot({ interceptors: [logUnexpectedErrors] }),
    ConfigModule,
    AuthModule,
    AuditModule,
    HealthModule,
    UsersModule,
    OrganizationsModule,
    CatalogsModule,
    TicketsModule,
  ],
})
export class AppModule {}
