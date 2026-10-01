import { Injectable } from "@nestjs/common";
import type { User } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { isInternalEmail } from "./internal-email";
import { UsersRepository } from "./users.repository";

@Injectable()
export class UsersService {
  constructor(private readonly repository: UsersRepository) {}

  async me(current: AuthenticatedUser): Promise<User> {
    return {
      id: current.id,
      username: current.username,
      name: current.name,
      email: isInternalEmail(current.email) ? null : current.email,
      role: current.role,
      activo: true, // un usuario desactivado no llega acá: el AuthGuard lo rechaza
      department: await this.repository.findDepartmentOf(current.id),
    };
  }
}
