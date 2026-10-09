# SPEC 08 — Tipos de área

> **Status:** Draft
> **Depends on:** SPEC 03 (auditoría y eliminación lógica), SPEC 04 (catálogos), SPEC 05 (tickets núcleo), SPEC 06 (comentarios y bandeja)
> **Date:** 2026-10-09
> **Objective:** separar el tipo del nombre de cada área con un catálogo nuevo "Tipos de área" (Diputado, Dirección, Bloque…), para elegir el área en un selector agrupado por tipo, verla como «Diputado · Acosta» y filtrar la bandeja por tipo.

## Por qué existe este spec

Hoy `Area` tiene solo `nombre`, y el tipo viaja como prefijo libre dentro del texto: `Dip. Acosta`, `Dir. de Logística`, `dir. coordinación…`, `Dirección de Servicios`, `BLOQUE UCR`. Esto trae tres problemas:

- Hay variantes del mismo prefijo ("Dir." y "Dirección", "Prosecretaría" y "Prosecretaria").
- Las 120 áreas salen en una sola lista plana.
- La bandeja no puede responder "todos los tickets de diputados".

El tipo pasa a ser un dato propio, administrable sin deploy: un 8.º catálogo con el mismo ABM que Edificios.

Decisiones del usuario del 2026-10-09:

- Los tipos son un catálogo nuevo, no una lista fija en el código.
- Todas las áreas que ya existen pasan al tipo «Otro». El admin las reclasifica a mano.
- El tipo es obligatorio en cada área.
- El área se elige en un selector agrupado por tipo y se muestra como «Diputado · Acosta».
- El nombre es único dentro de su tipo, no en todo el catálogo.
- Un tipo con áreas no se elimina (409), pero se puede desactivar.
- «Otro» es un ítem normal, sin clave de sistema.
- La bandeja suma el filtro "Tipo de área".
- El seed suma `tipos-area.json`, y `areas.json` pasa a `{ tipo, nombre }`.
- El `seed-data/areas.json` local (fuera de git) se convierte al formato nuevo, clasificado por prefijo.

## Alcance

**Dentro:**

- Modelo Prisma `TipoArea` (tabla `tipo_area`) y el campo obligatorio `Area.tipoId`.
- La migración `tipos_area`:
  - crea la tabla;
  - si hay áreas, crea el tipo «Otro» y se lo asigna a todas;
  - cambia el índice único de `area` a `(tipoId, nombreNormalizado)`.
- Contratos en `packages/contracts/src/catalogs.ts`:
  - la ruta `tiposArea` (catálogo simple);
  - `areaInputSchema` (`nombre` y `tipoId`) y `areaSchema` (con `tipo`);
  - `areaLabel()`, el formateador «Tipo · Nombre» que comparten la API y la web.
- `catalogs` en la API:
  - la definición de `tiposArea`;
  - Áreas con `tipoId` validado y unicidad por tipo;
  - el 409 al eliminar un tipo con áreas.
- `tickets`:
  - `area` en el ticket y en la bandeja trae su `tipo`;
  - la foto auditable guarda el área como «Tipo · Nombre»;
  - `tickets.list` acepta `tipoAreaId`.
- Web:
  - la pestaña "Tipos de área" en `/admin/catalogos`;
  - la pestaña Áreas con la columna Tipo y el selector de tipo en el alta y la edición;
  - `CatalogOptionSelect` agrupado por tipo cuando el catálogo es Áreas;
  - la columna Área de la bandeja con «Tipo · Nombre»;
  - el filtro "Tipo de área" en `/tickets`, guardado en la URL.
- Seed:
  - `seed-data/tipos-area.json` (en git);
  - `areas.json` y `areas.example.json` con el formato `{ tipo, nombre }`;
  - convertir el `seed-data/areas.json` local.
- `scripts/verify/specs/08-tipos-area.mjs`. Las altas de áreas de los verify 04, 05 y 06 pasan a mandar `tipoId`.
- Bruno: los requests de `bruno/catalogs/` que crean o editan un área mandan `tipoId`.
- Actualizar `CLAUDE.md`, `apps/api/CLAUDE.md`, `packages/db/CLAUDE.md`, `docs/prd.md`, `docs/checklist-permisos.md`, `seed-data/README.md` y `specs/00-catalogo-specs.md`.

**Fuera de alcance (para specs futuros):**

- Clasificar automáticamente las áreas que ya están en la base. La migración las deja todas en «Otro».
- Que el seed agregue tipos o áreas a una tabla que ya tiene filas.
- Una pantalla para reclasificar varias áreas a la vez.
- Ordenar las áreas dentro de cada tipo por separado. El `orden` de Áreas sigue siendo uno solo para todo el catálogo.
- Selectores encadenados (primero el tipo y después el área) en el ticket.
- Que el filtro "Tipo de área" acote las opciones del filtro "Área".
- Tipos de área con clave de sistema.

## Modelo de datos

```prisma
// packages/db/schema.prisma (fragmento)
model TipoArea {
  id                String    @id @default(cuid())
  nombre            String
  nombreNormalizado String
  orden             Int
  activo            Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  createdBy         String
  creador           User      @relation("TipoAreaCreador", fields: [createdBy], references: [id], onDelete: Restrict)
  updatedBy         String
  editor            User      @relation("TipoAreaEditor", fields: [updatedBy], references: [id], onDelete: Restrict)
  deletedAt         DateTime?
  areas             Area[]

  @@map("tipo_area")
}

model Area {
  // ... campos actuales sin cambios
  tipoId String
  tipo   TipoArea @relation(fields: [tipoId], references: [id], onDelete: Restrict)

  @@index([tipoId])
}
```

Índices únicos parciales, escritos a mano en el SQL como los de SPEC 04:

```sql
CREATE UNIQUE INDEX "tipo_area_nombreNormalizado_key" ON "tipo_area" ("nombreNormalizado") WHERE "deletedAt" IS NULL;
DROP INDEX "area_nombreNormalizado_key";
CREATE UNIQUE INDEX "area_tipoId_nombreNormalizado_key" ON "area" ("tipoId", "nombreNormalizado") WHERE "deletedAt" IS NULL;
```

La migración `tipos_area` hace estos pasos en orden:

1. Crea `tipo_area` y su índice.
2. Si `area` tiene filas, eliminadas incluidas, inserta «Otro» en `tipo_area`:
   - `orden` 1 y `activo` true;
   - `createdBy` y `updatedBy` = el `createdBy` del área de menor `orden`;
   - un `AuditLog` `create` con `entityType: "TipoArea"`, `actorId` null y `payload: { after: { nombre, orden, activo } }`.
3. Agrega `area.tipoId` como nullable, le asigna «Otro» a todas las filas y lo pasa a `NOT NULL` con su FK.
4. Reemplaza el índice único de `area`.

Sobre una base sin áreas (desarrollo, `pnpm verify`) no crea ningún tipo: los carga el seed.

Contratos (fragmento):

```ts
// packages/contracts/src/catalogs.ts
export const areaInputSchema = catalogItemInputSchema.extend({ tipoId: z.string().min(1) });
export const areaSchema = catalogItemSchema.extend({ tipo: z.object({ id: z.string(), nombre: z.string() }) });
export const areaLabel = (area: { nombre: string; tipo: { nombre: string } }) =>
  `${area.tipo.nombre} · ${area.nombre}`;

// catalogRutas: "areas", "tiposArea", "edificios", "tipos", "prioridades", "modulos", "proveedores", "estados"
// catalogsContract.areas     = catalogContract("areas", areaInputSchema, areaSchema)
// catalogsContract.tiposArea = catalogContract("tiposArea", catalogItemInputSchema, catalogItemSchema)
```

```ts
// packages/contracts/src/tickets.ts (fragmento)
// `area` del ticket y de la bandeja: { id, nombre, tipo: { id, nombre } } | null
// listTicketsInputSchema suma `tipoAreaId: filtroId`
```

Seed (`seed-data/`):

```json
// tipos-area.json (en git; el orden del archivo es el `orden`)
["Diputado", "Bloque", "Dirección", "Secretaría", "Prosecretaría", "Otro"]

// areas.json y areas.example.json
[{ "tipo": "Dirección", "nombre": "Logística" }, { "tipo": "Diputado", "nombre": "Acosta" }]
```

Convenciones:

- `AuditLog.entityType` del catálogo nuevo: `"TipoArea"`.
- La foto auditable de un área suma `tipo: { id, nombre }`. Cambiar el tipo deja un `update` con ese diff.
- La foto auditable del ticket guarda `area: { id, nombre: areaLabel(area) }`. El historial muestra «Diputado · Acosta» tal como era al guardar. Las entradas viejas siguen diciendo «Dip. Acosta».

## Contrato

### Feature 8.1 — Catálogo Tipos de área

- `catalogs.tiposArea.*` tiene los mismos 7 procedimientos, permisos y reglas que Edificios (SPEC 04). `list` lo lee cualquier usuario con sesión.
- Mensajes: "El tipo de área no existe" y "Ya existe un tipo de área con ese nombre".
- Eliminar un tipo con al menos un área no eliminada → 409 "Lo usa al menos un área: desactivalo en lugar de eliminarlo". Las áreas eliminadas no cuentan.
- Desactivar un tipo con áreas está permitido. Solo lo saca de las opciones del selector de tipo en el alta y la edición de un área. Sus áreas se siguen ofreciendo en los tickets, bajo su grupo.
- No tiene regla "último activo".

### Feature 8.2 — Áreas con tipo

- `create` y `update` de `catalogs.areas` exigen `tipoId`. Sin él → 400.
- `tipoId` tiene que ser un tipo no eliminado → si no, 400 "El tipo de área no existe o está desactivado".
- En el alta, el tipo tiene que estar activo. En la edición también, salvo que el área ya tenga ese tipo. Así se puede renombrar un área de un tipo desactivado sin cambiarle el tipo, igual que la "referencia válida" de SPEC 05.
- La unicidad del nombre normalizado es dentro del tipo:
  - «Diputado · Gonzalez» y «Bloque · Gonzalez» conviven;
  - un segundo «Gonzalez» bajo Diputado → 409 "Ya existe un área con ese nombre en ese tipo".
  - El chequeo del service y el índice parcial aplican la misma regla.
- `list`, `create`, `update` y `setActive` devuelven `areaSchema`, con `tipo: { id, nombre }`.
- `move`, `setActive` y `remove` no cambian. El 409 por "lo usa un ticket" sigue igual.

### Feature 8.3 — Tickets y bandeja

- `tickets.get`, `create`, `update`, `changeStatus` y `changeDepartment` devuelven `area` con su `tipo`. También cada fila de `tickets.list`.
- `tickets.list` acepta `tipoAreaId`. Filtra los tickets cuya área es de ese tipo, y se combina con AND con los demás filtros, `areaId` incluido. Un tipo inexistente devuelve una página vacía, igual que un `areaId` inexistente hoy.
- Ni el alta ni la edición del ticket cambian: el ticket sigue guardando solo `areaId`.

### Feature 8.4 — Web

- `/admin/catalogos`:
  - pestaña "Tipos de área", entre "Áreas" y "Edificios", con el ABM de un catálogo simple;
  - en "Áreas", columnas Tipo, Nombre y Estado;
  - el diálogo de alta y edición de un área pide Tipo (obligatorio) y Nombre. El selector de tipo ofrece los activos, más el actual si está desactivado, marcado "(inactivo)".
- `CatalogOptionSelect` con `ruta="areas"` (formularios del ticket y filtro Área de la bandeja):
  - agrupa las opciones bajo un título por tipo;
  - los grupos siguen el `orden` del catálogo Tipos de área, y las áreas de cada grupo el `orden` de Áreas;
  - un grupo sin áreas activas no se muestra;
  - el valor elegido se ve como «Diputado · Acosta».
- La columna Área de la bandeja y el área del detalle muestran `areaLabel(area)`.
- El filtro "Tipo de área" va junto al de Área en `/tickets`:
  - se guarda en la URL como `tipoAreaId`;
  - cambiarlo vuelve a la página 1;
  - muestra los tipos inactivos con "(inactivo)", como los demás filtros de catálogo.

### Feature 8.5 — Seed

- Orden de carga: tipos de área antes que áreas.
- `tipos-area.json` es opcional, igual que `areas.json`. Se carga solo si `tipo_area` está vacía.
- Cada `tipo` de `areas.json` se busca por nombre normalizado en `tipo_area`, ya cargada. Si alguno no existe, o hay dos áreas con el mismo nombre normalizado dentro de un tipo, el seed aborta antes de crear áreas y nombra los valores.
- Las áreas se cargan solo si `area` está vacía (regla de SPEC 04).
- El seed informa "Tipos de área" y "Áreas" creadas o salteadas, como hoy.

## Plan de implementación

1. **Esquema y migración.**
   - `TipoArea` y sus relaciones inversas en `User`, y `Area.tipoId` en `schema.prisma`.
   - La migración `tipos_area`, con los pasos del modelo de datos, el `INSERT` condicional de «Otro» y los índices a mano, comentados.

   Verificar:
   - `prisma migrate dev` aplica limpio, y un segundo `migrate dev` no genera nada;
   - sobre una copia de la base de desarrollo con áreas, todas quedan con tipo «Otro» y hay un `AuditLog` `create` de `TipoArea`;
   - sobre una base vacía no se crea ningún tipo.
2. **Contratos.** `tiposArea` en `catalogRutas` y `catalogsContract`; `areaInputSchema`, `areaSchema` y `areaLabel`; `area` con `tipo` y `tipoAreaId` en `tickets.ts`. Verificar con `catalogs.spec.ts`: un área sin `tipoId` se rechaza, y `areaLabel` devuelve «Diputado · Acosta».
3. **API, catálogo Tipos de área.**
   - `catalog-definitions.ts` suma `tiposArea` y una regla nueva: no se elimina mientras tenga áreas no eliminadas.
   - `CatalogsService.remove` la aplica.
   - `catalogs.controller.ts` y `catalogs-read.controller.ts` exponen la ruta.

   Verificar con `catalogs.service.spec.ts`: eliminar un tipo con un área → 409; con su única área eliminada → OK.
4. **API, Áreas con tipo.**
   - La definición de `areas` declara `tipoId` como campo de entrada, la unicidad por tipo y `tipo` en la foto y en la salida.
   - El service valida el tipo (Feature 8.2) y el repository lee la relación.

   Verificar con tests:
   - el mismo nombre en dos tipos → OK; en el mismo tipo → 409;
   - un tipo desactivado en el alta → 400;
   - renombrar un área cuyo tipo está desactivado → OK;
   - cambiar el tipo deja un `update` con `tipo` en el diff.
5. **API, tickets.**
   - `TicketsRepository` incluye `area.tipo` en el ticket y en la bandeja, y aplica `tipoAreaId` en `findPage`.
   - `ticket-audit-snapshot.ts` usa `areaLabel`.

   Verificar con `tickets.service.spec.ts`: filtrar por tipo devuelve solo los tickets de áreas de ese tipo; el diff de área muestra «Tipo · Nombre».
6. **Seed.**
   - `seed-data.ts` suma `tiposAreaSchema` y el nuevo `areasSchema` (`{ tipo, nombre }`).
   - `seed.ts` carga los tipos primero y resuelve `tipo` → `tipoId`, con los abortos de Feature 8.5.
   - Crear `tipos-area.json`, y actualizar `areas.example.json` y `seed-data/README.md`.

   Verificar: seed sobre una base vacía con el ejemplo → 6 tipos y las áreas del ejemplo; con un tipo inexistente en `areas.json` → aborta nombrándolo y no crea áreas.
7. **Convertir `seed-data/areas.json` local.** Se clasifica por prefijo, conservando el orden del archivo:
   - `Dip. ` → Diputado;
   - `BLOQUE ` → Bloque;
   - `Dir. `, `dir. ` y `Dirección ` → Dirección, quitando además un `de `/`del ` inicial;
   - `Secretaría ` → Secretaría;
   - `Prosecretaría ` y `Prosecretaria ` → Prosecretaría;
   - el resto → Otro, con el nombre intacto.

   Los duplicados que aparezcan al convertir (por ejemplo «Dir. de Servicios» y «Dirección de Servicios») quedan una sola vez, y se le listan al usuario para que los revise. Verificar: el seed acepta el archivo convertido.
8. **Web, administración.**
   - `catalog-kinds.ts` suma "Tipos de área".
   - `CatalogTable` muestra la columna Tipo en Áreas.
   - `CatalogItemFormDialog` suma el selector de tipo en Áreas, siguiendo el patrón de los campos extra de Proveedor.

   Verificar con tests de componente: el alta de un área sin tipo muestra el error; la pestaña Tipos de área crea, mueve, desactiva y elimina.
9. **Web, tickets y bandeja.**
   - `CatalogOptionSelect` agrupa cuando la ruta es `areas`.
   - `TicketsTable` y el detalle usan `areaLabel`.
   - `TicketsFilters` y `tickets-search.ts` suman `tipoAreaId`.

   Verificar con tests de componente:
   - el selector muestra los títulos de grupo en el orden de los tipos;
   - elegir un tipo en los filtros actualiza la URL y vuelve a la página 1;
   - la columna Área muestra «Diputado · Acosta».
10. **Verificación y documentación.**
    - `scripts/verify/specs/08-tipos-area.mjs`, agregado a `specs/index.mjs`. Los `createItem("areas")` de 04, 05 y 06 crean o reutilizan un tipo y mandan `tipoId`. El recorrido de catálogos de 04 suma `tiposArea`.
    - `bruno/catalogs/` con `tipoId` en las altas y ediciones de áreas.
    - `CLAUDE.md`: 8 catálogos, `TipoArea`, la migración `tipos_area` y `pnpm verify` de SPEC 01 a 08.
    - `apps/api/CLAUDE.md`: la regla "un tipo con áreas no se elimina" y la unicidad por tipo.
    - `packages/db/CLAUDE.md`: `TipoArea` y el índice único compuesto de `area`.
    - `docs/prd.md`: catálogos (§5 y §8), Tipos de área en P22 y el filtro de la bandeja en §5.1.
    - `docs/checklist-permisos.md`: filas de Tipos de área.
    - `specs/00-catalogo-specs.md`: la fila de SPEC 08.

    Verificar: `pnpm verify --spec 08` y `pnpm verify --spec 04,05,06` pasan.

## Criterios de aceptación

- [ ] Después de `prisma migrate deploy` sobre una base con áreas, cada área tiene `tipoId` = «Otro», sus nombres no cambiaron y existe exactamente un tipo de área.
- [ ] Sobre una base sin áreas, la migración no crea ningún tipo de área.
- [ ] El admin crea, edita, sube, baja, desactiva, reactiva y elimina un tipo de área por la API, y cada paso deja su `AuditLog` con `entityType: "TipoArea"`.
- [ ] Un agente recibe 403 en `create`, `update`, `move`, `setActive`, `remove` y `history` de `tiposArea`, y 200 en `list`.
- [ ] Eliminar un tipo con un área no eliminada devuelve 409. Después de eliminar esa área, eliminar el tipo devuelve 200.
- [ ] Crear un área sin `tipoId` devuelve 400. Con un `tipoId` inexistente o desactivado, también 400.
- [ ] «Gonzalez» se crea bajo Diputado y bajo Bloque. Un segundo «gonzález» bajo Diputado devuelve 409.
- [ ] Renombrar un área cuyo tipo está desactivado, sin cambiarle el tipo, devuelve 200.
- [ ] Cambiar el tipo de un área deja un `update` cuyo diff tiene `tipo` antes y después como `{ id, nombre }`.
- [ ] `catalogs.areas.list` devuelve cada área con `tipo: { id, nombre }`.
- [ ] `tickets.get` y cada fila de `tickets.list` traen `area.tipo`.
- [ ] Asignar un área a un ticket deja en su historial el área como «Tipo · Nombre».
- [ ] `tickets.list` con `tipoAreaId` devuelve solo los tickets cuya área es de ese tipo. Combinado con un `areaId` de otro tipo, devuelve una página vacía.
- [ ] Desactivar un tipo no saca a sus áreas activas del selector de área del ticket.
- [ ] En la web, el selector de área del ticket muestra las áreas agrupadas bajo títulos por tipo, y el valor elegido se ve como «Diputado · Acosta».
- [ ] En la web, la columna Área de la bandeja muestra «Tipo · Nombre», y recargar `/tickets?tipoAreaId=<id>` conserva el filtro.
- [ ] En la web, la pestaña Áreas muestra la columna Tipo, y el alta de un área sin tipo no se envía.
- [ ] El seed sobre una base vacía con `tipos-area.json` y `areas.example.json` crea los tipos y las áreas con su tipo. Con un tipo que no existe en `areas.json`, aborta nombrándolo y no crea áreas.
- [ ] `pnpm verify --spec 04,05,06,08` y `pnpm turbo lint typecheck test build` terminan con código 0.

## Decisiones

- **Sí:** un catálogo nuevo `TipoArea` (decisión del usuario, 2026-10-09). El admin agrega un tipo («Comisión», «Oficina») sin deploy. Es otro modelo Prisma con su registro en `catalog-definitions.ts`, como pide SPEC 04.
- **No:** un enum fijo en el contrato. Cada tipo nuevo exigiría migración y deploy.
- **No:** separar con texto libre dentro de Área (un campo `tipo: string`). Repetiría el problema de las variantes «Dir.» y «Dirección».
- **Sí:** el tipo es obligatorio (decisión del usuario, 2026-10-09). Lo inclasificable va a «Otro».
- **Sí:** la migración pasa todas las áreas existentes a «Otro», sin deducir el tipo del prefijo (decisión del usuario, 2026-10-09). Así no adivina mal ningún nombre, y el admin reclasifica a mano.
- **Sí:** «Otro» lo crea la migración solo si hay áreas, con el `createdBy` del área de menor `orden`. La columna es FK obligatoria, y en SQL no hay otra forma fiable de elegir un usuario existente. El `AuditLog` va con `actorId` null (sistema), como el seed (SPEC 04).
- **No:** un `AuditLog` por cada área reclasificada por la migración. El historial de cada área muestra el tipo desde su primer cambio. La reclasificación queda explicada en este spec.
- **Sí:** «Otro» es un ítem normal, sin `clave` (decisión del usuario, 2026-10-09).
- **Sí:** nombre único dentro del tipo (decisión del usuario, 2026-10-09), con un índice único parcial compuesto `(tipoId, nombreNormalizado)`.
- **Sí:** eliminar un tipo con áreas → 409; desactivarlo, permitido (decisión del usuario, 2026-10-09). Es la misma regla que "lo usa un ticket" de SPEC 05.
- **No:** que desactivar un tipo oculte sus áreas en los tickets. Para eso se desactivan las áreas.
- **Sí:** un selector agrupado por tipo con la etiqueta «Diputado · Acosta» (decisión del usuario, 2026-10-09). El ticket sigue guardando solo `areaId`.
- **No:** dos selectores encadenados, ni un selector plano.
- **Sí:** `areaLabel()` en `@syc/contracts`, para que la API (foto auditable) y la web formateen igual.
- **Sí:** la foto auditable del ticket guarda el área como «Tipo · Nombre» en `nombre`, en vez de sumar `tipo` a la referencia. El historial muestra cómo se veía el área al guardar, y `ref()` mantiene su forma `{ id, nombre }`.
- **Sí:** filtro "Tipo de área" en la bandeja (decisión del usuario, 2026-10-09). Se combina con AND con el de Área, sin acotar sus opciones, porque es más simple y un cruce vacío es fácil de entender.
- **Sí:** `orden` de Áreas global, sin orden propio dentro de cada tipo. Las flechas Subir/Bajar siguen igual (SPEC 04), y el selector agrupa respetando ese orden.
- **Sí:** `tipos-area.json` en git, y `areas.json` con `{ tipo, nombre }` (decisión del usuario, 2026-10-09). Los tipos son públicos y fijos para una base nueva. Las áreas siguen fuera de git.
- **Sí:** convertir el `seed-data/areas.json` local clasificando por prefijo (decisión del usuario, 2026-10-09). Es solo para bases nuevas: la base existente queda en «Otro».
- **Sí:** ruta `tiposArea` y pestaña "Tipos de área". `tipos` ya es Tipos de ticket.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| En producción, el seed no carga los tipos porque `tipo_area` ya tiene «Otro»: el admin crea los tipos y reclasifica unas 120 áreas a mano. | Fue una decisión explícita. `docs/despliegue.md` suma una nota para el deploy de este spec. Si resulta lento, una pantalla de reclasificación masiva va en otro spec. |
| La migración falla si dos áreas no eliminadas tienen el mismo nombre normalizado. | No puede pasar: el índice actual ya las hace únicas en todo el catálogo, que es más estricto que por tipo. |
| Prisma no conoce los índices parciales y un `migrate dev` futuro podría proponer borrarlos. | Igual que en SPEC 04: el paso 1 verifica que un segundo `migrate dev` no genera nada. El SQL lo comenta. |
| Al quitar el prefijo, el convertidor deja duplicados o nombres raros («Dir. de Coordinacion» y «Dir. de Coordinación Administrativa»). | Los duplicados se listan al usuario, y el seed aborta si quedara alguno. El archivo convertido se revisa a mano antes de usarlo. |
| El service genérico de catálogos crece con reglas propias de Áreas (unicidad por tipo, campo relación). | Las reglas se declaran en la definición, como `lastActive` y `keyedNotRemovable`. El service no pregunta qué catálogo es. Los tests cubren Áreas y Tipos de área por separado. |
| Los verify 04, 05 y 06 crean áreas sin tipo y se rompen. | El paso 10 los actualiza, y el criterio de aceptación exige que pasen. |

## Qué **no** está en este spec

- Clasificar automáticamente las áreas existentes en la base.
- Reclasificación masiva de áreas.
- Orden de áreas propio dentro de cada tipo.
- Selectores encadenados tipo → área en el ticket.
- Que el filtro de tipo acote las opciones del filtro de área.
- Tipos de área de sistema (con `clave`).
- Que el seed complete tablas que ya tienen filas.

Cada uno, si hace falta, va en su propio spec.
