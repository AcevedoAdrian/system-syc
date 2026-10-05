import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { UsersController } from "./users.controller";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";
import { UsersMeController } from "./users-me.controller";

@Module({
  imports: [AuditModule],
  controllers: [UsersMeController, UsersController],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
