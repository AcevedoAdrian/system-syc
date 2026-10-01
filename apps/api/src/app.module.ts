import { Module } from "@nestjs/common";
import { ConfigModule } from "./config/config.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [ConfigModule, AuthModule, HealthModule, UsersModule],
})
export class AppModule {}
