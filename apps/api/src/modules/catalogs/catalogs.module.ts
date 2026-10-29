import { Global, Module } from "@nestjs/common";
import { MODULE_USAGE_READER } from "../../common/module-usage-reader";
import { AuditModule } from "../audit/audit.module";
import { CatalogsController } from "./catalogs.controller";
import { CatalogsRepository } from "./catalogs.repository";
import { CatalogsService } from "./catalogs.service";
import { CatalogsReadController } from "./catalogs-read.controller";

// Es global porque `organizations` inyecta `MODULE_USAGE_READER` sin importar este módulo: no conoce
// la tabla `modulo_departamento` (SPEC 11, Feature 11.3).
@Global()
@Module({
  imports: [AuditModule],
  controllers: [CatalogsReadController, CatalogsController],
  providers: [
    CatalogsService,
    CatalogsRepository,
    { provide: MODULE_USAGE_READER, useExisting: CatalogsRepository },
  ],
  exports: [MODULE_USAGE_READER],
})
export class CatalogsModule {}
