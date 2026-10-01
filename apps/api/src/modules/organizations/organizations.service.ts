import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type {
  Organization,
  OrganizationInput,
  RenameOrganizationInput,
  SetOrganizationActiveInput,
} from "@syc/contracts";
import { normalizeName, uniqueSlug } from "../../common/text";
import { type OrganizationRow, OrganizationsRepository } from "./organizations.repository";

function toOrganization(row: OrganizationRow): Organization {
  return { id: row.id, nombre: row.name, activo: row.activo, agentes: row.agentes };
}

@Injectable()
export class OrganizationsService {
  constructor(private readonly repository: OrganizationsRepository) {}

  async list(): Promise<Organization[]> {
    return (await this.repository.findAll()).map(toOrganization);
  }

  async create(input: OrganizationInput): Promise<Organization> {
    const all = await this.repository.findAll();
    this.assertNameIsFree(all, input.nombre);
    const slug = uniqueSlug(input.nombre, new Set(all.map((row) => row.slug)));
    return toOrganization(await this.repository.create({ name: input.nombre, slug }));
  }

  // El `slug` no cambia al renombrar: es un identificador que Better Auth usa internamente.
  async rename(input: RenameOrganizationInput): Promise<Organization> {
    const all = await this.repository.findAll();
    this.requireIn(all, input.organizationId);
    this.assertNameIsFree(all, input.nombre, input.organizationId);
    return toOrganization(await this.repository.rename(input.organizationId, input.nombre));
  }

  async setActive(input: SetOrganizationActiveInput): Promise<Organization> {
    const all = await this.repository.findAll();
    const current = this.requireIn(all, input.organizationId);
    if (!input.activo && this.isLastActive(all, current)) {
      throw new ORPCError("CONFLICT", {
        message: "No se puede desactivar el último departamento activo",
      });
    }
    return toOrganization(await this.repository.setActive(input.organizationId, input.activo));
  }

  // En SPEC 05 este mismo método suma el chequeo de tickets (ni siquiera eliminados lógicamente).
  async remove(organizationId: string): Promise<void> {
    const all = await this.repository.findAll();
    const current = this.requireIn(all, organizationId);
    if (this.isLastActive(all, current)) {
      throw new ORPCError("CONFLICT", {
        message: "No se puede eliminar el último departamento activo",
      });
    }
    if (current.agentes > 0) {
      throw new ORPCError("CONFLICT", {
        message: "El departamento tiene agentes asignados: desactivalo en lugar de eliminarlo",
      });
    }
    await this.repository.remove(organizationId);
  }

  private requireIn(all: OrganizationRow[], id: string): OrganizationRow {
    const found = all.find((row) => row.id === id);
    if (!found) throw new ORPCError("NOT_FOUND", { message: "El departamento no existe" });
    return found;
  }

  private assertNameIsFree(all: OrganizationRow[], name: string, exceptId?: string): void {
    const key = normalizeName(name);
    const taken = all.some((row) => row.id !== exceptId && normalizeName(row.name) === key);
    if (taken) {
      throw new ORPCError("CONFLICT", { message: "Ya existe un departamento con ese nombre" });
    }
  }

  private isLastActive(all: OrganizationRow[], current: OrganizationRow): boolean {
    return current.activo && all.filter((row) => row.activo).length === 1;
  }
}
