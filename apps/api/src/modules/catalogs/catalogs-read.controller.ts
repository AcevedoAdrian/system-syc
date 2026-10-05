import { Controller } from "@nestjs/common";
import { Implement, implement } from "@orpc/nest";
import { contract } from "@syc/contracts";
import { CATALOG_DEFINITIONS } from "./catalog-definitions";
import { CatalogsService } from "./catalogs.service";

const c = contract.catalogs;

// Solo los `list`: cualquier usuario con sesión los necesita para los formularios de tickets
// (SPEC 05) y los filtros de la bandeja (SPEC 06). Sin `@RequirePermission`: el `AuthGuard` global
// ya exige sesión. El resto de cada catálogo es del admin y vive en `CatalogsController`.
const listContract = {
  areas: { list: c.areas.list },
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

  // El service devuelve la unión de los 7 catálogos; el esquema de salida de cada procedimiento es
  // el que describe la forma exacta.
  @Implement(listContract)
  lists() {
    const d = CATALOG_DEFINITIONS;
    return {
      areas: { list: implement(c.areas.list).handler(() => this.service.list(d.areas) as never) },
      edificios: {
        list: implement(c.edificios.list).handler(() => this.service.list(d.edificios) as never),
      },
      tipos: { list: implement(c.tipos.list).handler(() => this.service.list(d.tipos) as never) },
      prioridades: {
        list: implement(c.prioridades.list).handler(
          () => this.service.list(d.prioridades) as never,
        ),
      },
      modulos: {
        list: implement(c.modulos.list).handler(() => this.service.list(d.modulos) as never),
      },
      proveedores: {
        list: implement(c.proveedores.list).handler(
          () => this.service.list(d.proveedores) as never,
        ),
      },
      estados: {
        list: implement(c.estados.list).handler(() => this.service.list(d.estados) as never),
      },
    };
  }
}
