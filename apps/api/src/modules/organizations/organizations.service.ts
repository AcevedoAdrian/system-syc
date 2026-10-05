import { Injectable } from "@nestjs/common";
import { ORPCError } from "@orpc/server";
import type {
  AuditHistory,
  Organization,
  OrganizationInput,
  RenameOrganizationInput,
  SetOrganizationActiveInput,
} from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { normalizeName, uniqueSlug } from "../../common/text";
import type { AuditEntry } from "../audit/audit.repository";
import { AuditService } from "../audit/audit.service";
import { computeDiff, pickSnapshot } from "../audit/audit-diff";
import { type OrganizationRow, OrganizationsRepository } from "./organizations.repository";

function toOrganization(row: OrganizationRow): Organization {
  return { id: row.id, nombre: row.name, activo: row.activo, agentes: row.agentes };
}

const ENTITY_TYPE = "Organization";

// Foto auditable (SPEC 03): solo estos campos entran en el diff.
function snapshotOf(row: OrganizationRow) {
  return pickSnapshot(toOrganization(row), ["nombre", "activo"]);
}

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly repository: OrganizationsRepository,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<Organization[]> {
    return (await this.repository.findAll()).map(toOrganization);
  }

  // Sin chequear que el departamento exista: el de uno ya eliminado se sigue leyendo, y un id sin
  // registros devuelve `[]`.
  async history(organizationId: string): Promise<AuditHistory> {
    return this.audit.history(ENTITY_TYPE, organizationId);
  }

  async create(input: OrganizationInput, actor: AuthenticatedUser): Promise<Organization> {
    const all = await this.repository.findAll();
    this.assertNameIsFree(all, input.nombre);
    const slug = uniqueSlug(input.nombre, new Set(all.map((row) => row.slug)));
    const created = await this.repository.create(
      { name: input.nombre, slug },
      {
        entityType: ENTITY_TYPE,
        action: "create",
        actorId: actor.id,
        payload: { after: { nombre: input.nombre, activo: true } },
      },
    );
    return toOrganization(created);
  }

  // El `slug` no cambia al renombrar: es un identificador que Better Auth usa internamente.
  // Sin cambios efectivos no se escribe nada y no queda registro.
  async rename(input: RenameOrganizationInput, actor: AuthenticatedUser): Promise<Organization> {
    const all = await this.repository.findAll();
    const current = this.requireIn(all, input.organizationId);
    this.assertNameIsFree(all, input.nombre, input.organizationId);
    const audit = this.updateEntry(current, { ...current, name: input.nombre }, actor);
    if (!audit) return toOrganization(current);
    return toOrganization(await this.repository.rename(current.id, input.nombre, audit));
  }

  async setActive(
    input: SetOrganizationActiveInput,
    actor: AuthenticatedUser,
  ): Promise<Organization> {
    const all = await this.repository.findAll();
    const current = this.requireIn(all, input.organizationId);
    if (!input.activo && this.isLastActive(all, current)) {
      throw new ORPCError("CONFLICT", {
        message: "No se puede desactivar el último departamento activo",
      });
    }
    const audit = this.updateEntry(current, { ...current, activo: input.activo }, actor);
    if (!audit) return toOrganization(current);
    return toOrganization(await this.repository.setActive(current.id, input.activo, audit));
  }

  // En SPEC 05 este mismo método suma el chequeo de tickets (ni siquiera eliminados lógicamente).
  async remove(organizationId: string, actor: AuthenticatedUser): Promise<void> {
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
    await this.repository.remove(organizationId, {
      entityType: ENTITY_TYPE,
      entityId: organizationId,
      action: "delete",
      actorId: actor.id,
      payload: {},
    });
  }

  // `null` cuando la foto auditable no cambió: no hay nada que escribir ni auditar.
  private updateEntry(
    before: OrganizationRow,
    after: OrganizationRow,
    actor: AuthenticatedUser,
  ): AuditEntry | null {
    const diff = computeDiff(snapshotOf(before), snapshotOf(after));
    if (!diff) return null;
    return {
      entityType: ENTITY_TYPE,
      entityId: before.id,
      action: "update",
      actorId: actor.id,
      payload: { ...diff },
    };
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
