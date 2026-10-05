import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import type { Router } from "@orpc/server";
import { contract } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { PERMISSIONS } from "../../common/permissions";
import { CATALOG_DEFINITIONS, type CatalogDefinition } from "./catalog-definitions";
import { CatalogsService } from "./catalogs.service";

const c = contract.catalogs;

type CatalogContract = (typeof c)[keyof typeof c];
type MutationsContract = Omit<CatalogContract, "list">;

// Todo menos `list` (ese lo implementa `CatalogsReadController`, sin permiso de admin).
function withoutList<T extends { list: unknown }>(catalog: T): Omit<T, "list"> {
  const { list: _list, ...mutations } = catalog;
  return mutations;
}

const mutationsContract = {
  areas: withoutList(c.areas),
  edificios: withoutList(c.edificios),
  tipos: withoutList(c.tipos),
  prioridades: withoutList(c.prioridades),
  modulos: withoutList(c.modulos),
  proveedores: withoutList(c.proveedores),
  estados: withoutList(c.estados),
};

type CatalogInput = Parameters<CatalogsService["create"]>[1];

@Controller()
export class CatalogsController {
  constructor(private readonly service: CatalogsService) {}

  // Se implementa el router completo (menos `list`) para que el compilador marque cualquier
  // procedimiento faltante. El permiso `manage` aplica a los 7 catálogos y a todos sus
  // procedimientos, también `history`.
  @RequirePermission(PERMISSIONS.MANAGE)
  @Implement(mutationsContract)
  catalogs(@CurrentUser() actor: AuthenticatedUser) {
    const d = CATALOG_DEFINITIONS;
    return {
      areas: this.mutations(d.areas, mutationsContract.areas, actor),
      edificios: this.mutations(d.edificios, mutationsContract.edificios, actor),
      tipos: this.mutations(d.tipos, mutationsContract.tipos, actor),
      prioridades: this.mutations(d.prioridades, mutationsContract.prioridades, actor),
      modulos: this.mutations(d.modulos, mutationsContract.modulos, actor),
      proveedores: this.mutations(d.proveedores, mutationsContract.proveedores, actor),
      estados: this.mutations(d.estados, mutationsContract.estados, actor),
    };
  }

  // Los 6 procedimientos de un catálogo. Su tipo de retorno sigue al contrato exacto de cada uno
  // (entrada de Proveedor, salida de Estados), así `@Implement` sigue verificando la forma del
  // router. El service trabaja con la unión de los 7: dentro del cuerpo el tipo se ajusta, y el
  // `satisfies` mantiene el aviso del compilador si falta algún procedimiento.
  private mutations<C extends MutationsContract>(
    def: CatalogDefinition,
    mutations: C,
    actor: AuthenticatedUser,
  ): Router<C, Record<never, never>> {
    const router = {
      create: implement(mutations.create).handler(
        async ({ input }) =>
          (await this.service.create(def, input as CatalogInput, actor)) as never,
      ),
      update: implement(mutations.update).handler(
        async ({ input }) =>
          (await this.service.update(def, input.itemId, input as CatalogInput, actor)) as never,
      ),
      move: implement(mutations.move).handler(({ input }) =>
        this.service.move(def, input.itemId, input.direccion, actor),
      ),
      setActive: implement(mutations.setActive).handler(
        async ({ input }) =>
          (await this.service.setActive(def, input.itemId, input.activo, actor)) as never,
      ),
      remove: implement(mutations.remove).handler(({ input }) =>
        this.service.remove(def, input.itemId, actor),
      ),
      history: implement(mutations.history).handler(({ input }) =>
        this.service.history(def, input.itemId),
      ),
    } satisfies Record<keyof MutationsContract, unknown>;
    return router as unknown as Router<C, Record<never, never>>;
  }
}
