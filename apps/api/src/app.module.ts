import { Module } from "@nestjs/common";
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
