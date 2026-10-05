import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { CatalogsController } from "./catalogs.controller";
import { CatalogsRepository } from "./catalogs.repository";
import { CatalogsService } from "./catalogs.service";
import { CatalogsReadController } from "./catalogs-read.controller";

@Module({
  imports: [AuditModule],
  controllers: [CatalogsReadController, CatalogsController],
  providers: [CatalogsService, CatalogsRepository],
})
export class CatalogsModule {}
