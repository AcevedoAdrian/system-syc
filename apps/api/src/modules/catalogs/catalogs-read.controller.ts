import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import type { AuthenticatedUser } from "../../common/authenticated-request";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { CATALOG_DEFINITIONS } from "./catalog-definitions";
import { CatalogsService } from "./catalogs.service";

const c = contract.catalogs;

// Solo los `list`: cualquier usuario con sesión los necesita para los formularios de tickets
// (SPEC 05) y los filtros de la bandeja (SPEC 06). Sin `@RequirePermission`: el `AuthGuard` global
// ya exige sesión, por eso el service recibe al usuario y no `user.scope` (que deja el guard de
// permisos): Módulos recorta su lista a los del departamento del agente. El resto de cada catálogo es
// del admin y vive en `CatalogsController`.
const listContract = {
  areas: { list: c.areas.list },
  tiposArea: { list: c.tiposArea.list },
  edificios: { list: c.edificios.list },
  tipos: { list: c.tipos.list },
  prioridades: { list: c.prioridades.list },
  modulos: { list: c.modulos.list },
  proveedores: { list: c.proveedores.list },
  estados: { list: c.estados.list },
};

@Controller()
export class CatalogsReadController {
  constructor(private readonly service: CatalogsService) {}

  // El service devuelve la unión de los 8 catálogos; el esquema de salida de cada procedimiento es
  // el que describe la forma exacta.
  @Implement(listContract)
  lists(@CurrentUser() actor: AuthenticatedUser) {
    const d = CATALOG_DEFINITIONS;
    return {
      areas: {
        list: implement(c.areas.list).handler(() => this.service.list(d.areas, actor) as never),
      },
      tiposArea: {
        list: implement(c.tiposArea.list).handler(
          () => this.service.list(d.tiposArea, actor) as never,
        ),
      },
      edificios: {
        list: implement(c.edificios.list).handler(
          () => this.service.list(d.edificios, actor) as never,
        ),
      },
      tipos: {
        list: implement(c.tipos.list).handler(() => this.service.list(d.tipos, actor) as never),
      },
      prioridades: {
        list: implement(c.prioridades.list).handler(
          () => this.service.list(d.prioridades, actor) as never,
        ),
      },
      modulos: {
        list: implement(c.modulos.list).handler(() => this.service.list(d.modulos, actor) as never),
      },
      proveedores: {
        list: implement(c.proveedores.list).handler(
          () => this.service.list(d.proveedores, actor) as never,
        ),
      },
      estados: {
        list: implement(c.estados.list).handler(() => this.service.list(d.estados, actor) as never),
      },
    };
  }
}
