import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersRepository } from "./users.repository";
import { UsersService } from "./users.service";
import { UsersMeController } from "./users-me.controller";

@Module({
  controllers: [UsersMeController, UsersController],
  providers: [UsersService, UsersRepository],
})
export class UsersModule {}
