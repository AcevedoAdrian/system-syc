# SPEC 11 — Módulos por departamento

> **Status:** Implemented
> **Depends on:** SPEC 02 (autenticación y acceso), SPEC 03 (auditoría y eliminación lógica), SPEC 04 (catálogos), SPEC 05 (tickets núcleo), SPEC 06 (comentarios y bandeja), SPEC 08 (tipos de área: la referencia a otro catálogo y la «referencia válida»), SPEC 10 (número de factura: su verify se corre junto)
> **Date:** 2026-10-29
> **Objective:** que cada módulo pertenezca a uno o más departamentos, y que el selector de módulo del ticket (en el alta y en la edición) ofrezca solo los del departamento de ese ticket.

## Por qué existe este spec

Hoy `Modulo` es un catálogo simple, y cualquier usuario ve la lista completa. Un agente de Redes elige entre módulos que solo usa Técnico, y nada impide guardar un módulo ajeno al departamento del ticket.

El filtro tiene que estar en la API, no solo en la pantalla. Hoy `catalogs.modulos.list` lo lee cualquier usuario con sesión. Para que el agente vea solo lo de su departamento, la API tiene que recortar la lista, como ya hace con los tickets. Es un poco más de trabajo, pero deja la regla en un solo lugar.

Decisiones del usuario del 2026-10-29:

- Un módulo pertenece a **uno o más** departamentos (por ejemplo, «Servidores» a Desarrollo y a Redes). Al menos uno es obligatorio.
- El admin elige los departamentos al cargar o editar el módulo, con una casilla por departamento.
- La base arranca de cero: la migración no asigna departamentos a módulos existentes. Los módulos se cargan con un seed nuevo, `seed-data/modulos.json`, en git.
- El servidor valida que el módulo sea del departamento del ticket. Acepta el que el ticket ya tenía.
- Al cambiar el departamento del ticket, el módulo se vacía solo si no es del nuevo departamento.
- El diálogo «Cambiar departamento» avisa que el ticket puede perder su módulo, si tiene uno.
- `catalogs.modulos.list` le devuelve a un agente solo los módulos de su departamento. El admin recibe todos.
- El filtro «Módulo» de la bandeja: el agente ve los suyos y el admin todos, sin que el filtro Departamento acote las opciones.
- Un departamento usado por algún módulo no se elimina (409).
- Un módulo que el ticket conserva pero que ya no se ofrece se muestra marcado «(no disponible)».
- El alta del ticket suma el campo «Módulo».

## Alcance

**Dentro:**

- Modelo Prisma `ModuloDepartamento` (tabla `modulo_departamento`) y la migración `modulos_departamentos`, que además agrega a `ticket` el índice `(departamentoId, moduloId)`.
- Contratos:
  - en `packages/contracts/src/catalogs.ts`, `moduloInputSchema` (con `departamentoIds`) y `moduloSchema` (con `departamentos`);
  - en `packages/contracts/src/tickets.ts`, `moduloId` en `createTicketInputSchema`.
- `catalogs` en la API:
  - la definición de `modulos` declara la relación con departamentos;
  - el alta y la edición validan los departamentos;
  - eliminar un módulo borra sus filas de `modulo_departamento`;
  - `list` recorta por departamento para un agente.
- `organizations`: el 409 al eliminar un departamento que usa un módulo.
- `tickets`:
  - `create` acepta y valida `moduloId`;
  - `update` valida el módulo contra el departamento del ticket;
  - `changeDepartment` vacía el módulo si no es del nuevo departamento.
- Web:
  - la pestaña Módulos de `/admin/catalogos`, con la columna «Departamentos» y las casillas en el panel;
  - `CatalogOptionSelect` filtra los módulos por departamento y marca «(no disponible)»;
  - el campo «Módulo» en `CreateTicketForm` y el filtro en `TicketForm`;
  - el aviso del módulo en `ChangeDepartmentDialog`.
- Seed: `seed-data/modulos.json` (en git) y su carga.
- `scripts/verify/specs/11-modulos-departamento.mjs`. Las altas de módulos de los verify que ya existen pasan a mandar `departamentoIds`.
- Bruno:
  - `bruno/catalogs/create.bru` y `update.bru` mandan `departamentoIds`;
  - `bruno/tickets/create.bru` documenta el `moduloId` opcional del alta;
  - el request de eliminar departamento de `bruno/organizations/` documenta el nuevo 409.
- Documentación: `CLAUDE.md`, `apps/api/CLAUDE.md`, `packages/db/CLAUDE.md`, `docs/prd.md`, `docs/checklist-permisos.md`, `docs/despliegue.md`, `seed-data/README.md` y `specs/00-catalogo-specs.md`.

**Fuera de alcance (para otros specs):**

- Que el filtro Departamento de la bandeja acote las opciones del filtro Módulo.
- Recortar por departamento otros catálogos (Áreas, Tipos de ticket, Proveedores…).
- Asignar departamentos a los módulos que ya existen en una base con datos. La migración no los toca.
- Que el seed complete una tabla `modulo` que ya tiene filas.
- Un orden de módulos propio por departamento. El `orden` sigue siendo uno solo para todo el catálogo.
- Una pantalla para asignar departamentos a varios módulos a la vez.
- Módulos que dependan del área, del tipo de ticket o de otro catálogo.

## Modelo de datos

`packages/db/schema.prisma`:

```prisma
model ModuloDepartamento {
  moduloId       String
  modulo         Modulo       @relation(fields: [moduloId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Restrict)

  @@id([moduloId, organizationId])
  @@index([organizationId])
  @@map("modulo_departamento")
}

model Modulo {
  // ... campos actuales sin cambios
  departamentos ModuloDepartamento[]
}

model Organization {
  // ... campos actuales sin cambios
  modulos ModuloDepartamento[]
}

model Ticket {
  // ... campos e índices actuales sin cambios
  @@index([departamentoId, moduloId])
}
```

La migración `modulos_departamentos` (generada por `prisma migrate dev`) crea la tabla, su clave, su índice y sus FK, y el índice `ticket_departamentoId_moduloId_idx`. No asigna departamentos a ningún módulo: la base arranca de cero (decisión del usuario).

El índice de `ticket` es para el filtro «Módulo» de la bandeja: el de un agente siempre va acotado por su departamento, y ese es el caso que cubre.

Sin campos base ni `deletedAt` en la tabla de unión: es parte del módulo y se audita en su foto. Eliminar un módulo (lógico) borra físicamente sus filas de `modulo_departamento` en la misma transacción. Así solo quedan filas de módulos no eliminados, y la FK `Restrict` del departamento las cuenta tal cual.

Contratos (fragmento):

```ts
// packages/contracts/src/catalogs.ts
export const moduloInputSchema = catalogItemInputSchema.extend({
  departamentoIds: z.array(z.string().min(1)).min(1, "Elegí al menos un departamento"),
});
export const moduloSchema = catalogItemSchema.extend({
  departamentos: z.array(z.object({ id: z.string(), nombre: z.string() })),
});
// catalogsContract.modulos = catalogContract("modulos", moduloInputSchema, moduloSchema)
```

```ts
// packages/contracts/src/tickets.ts (fragmento)
// createTicketInputSchema suma `moduloId: idOpcionalSchema`
```

Seed (`seed-data/modulos.json`, en git; el orden del archivo es el `orden`):

```json
[{ "nombre": "Servidores", "departamentos": ["Desarrollo", "Redes"] }]
```

El contenido real lo da el usuario al implementar: `/spec-impl` se lo pide en el paso 7. Si no lo da, el archivo sale con este ejemplo.

Convenciones:

- `departamentoIds` se deduplica en el service. El orden en que llega no importa.
- La foto auditable del módulo suma `departamentos: [{ id, nombre }]`, ordenada por nombre normalizado. Así un cambio de orden no deja diff, y sumar o quitar un departamento deja un `update` con `departamentos` antes y después.
- La salida (`moduloSchema.departamentos`) usa el mismo orden.
- `AuditLog.entityType` sigue siendo `"Modulo"`.

## Contrato

### Feature 11.1 — Módulos con departamentos

- **MUST:**
  - `create` y `update` de `catalogs.modulos` exigen `departamentoIds` con al menos un id. Vacío o ausente → 400 "Elegí al menos un departamento".
  - Cada id tiene que ser un departamento existente y activo. Si no → 400 "El departamento no existe o está desactivado".
  - En la edición se acepta un departamento desactivado que el módulo ya tenía (misma regla que la "referencia válida" de SPEC 05 y SPEC 08).
  - `update` reemplaza la lista entera. Una edición que no cambia ni el nombre ni el conjunto de departamentos responde 200 y no escribe ni audita.
  - `list`, `create`, `update` y `setActive` devuelven `moduloSchema`, con `departamentos`.
  - El nombre sigue siendo único en todo el catálogo: un solo «Servidores», con varios departamentos.
  - `remove` borra las filas de `modulo_departamento` del módulo en la misma transacción. El 409 por "lo usa un ticket" sigue igual.
  - La relación se declara en `catalog-definitions.ts` con un miembro nuevo de `CatalogDefinition` (por ejemplo `links`), junto a `reference`: `reference` es una FK simple y esta es muchos a muchos. Declara el campo de entrada (`departamentoIds`), la relación que se lee y se audita (`departamentos`), la tabla de unión (`moduloDepartamento`), el modelo destino (`organization`) y el mensaje del 400. El service genérico no pregunta qué catálogo es.
- **EDGE CASES:**
  - El mismo id dos veces en `departamentoIds` cuenta una sola vez.
  - Un departamento eliminado (borrado físico) no existe: 400.
  - `move` y `setActive` no cambian los departamentos.
- **MUST NOT:** aceptar un módulo sin departamentos; guardar departamentos en otra tabla que no sea `modulo_departamento`.

### Feature 11.2 — Lista de módulos por alcance

- **MUST:**
  - `catalogs.modulos.list` lo sigue leyendo cualquier usuario con sesión.
  - A un agente le devuelve solo los módulos que tienen su departamento, activos e inactivos.
  - Al admin le devuelve todos.
  - Cada módulo trae todos sus departamentos, también para el agente.
  - Un agente sin departamento recibe una lista vacía.
  - El recorte lo hace el service con `user.scope`, igual que `tickets.list`. La web no repite la regla del agente: muestra lo que recibe.
- **MUST NOT:**
  - recortar los demás catálogos;
  - dejar el recorte del agente solo en la pantalla.

### Feature 11.3 — Departamentos usados por módulos

- **MUST:** `organizations.remove` de un departamento con al menos una fila en `modulo_departamento` → 409 "Lo usa al menos un módulo: quitáselo a esos módulos o desactivalo". Se chequea después de agentes y tickets.
- **MUST:** `organizations` lo consulta por un lector en `src/common/` (mismo patrón que `TICKET_USAGE_READER`): no conoce la tabla `modulo_departamento`.
- **EDGE CASES:** un departamento usado solo por módulos eliminados se elimina, porque esos módulos ya no tienen filas.

### Feature 11.4 — Módulo del ticket

- **MUST:**
  - `tickets.create` acepta `moduloId` opcional. Si viene, el módulo tiene que existir, no estar eliminado, estar activo y tener el `departamentoId` del ticket.
  - `tickets.update`: un `moduloId` distinto del actual sigue la misma regla, contra el departamento actual del ticket.
  - `tickets.update` acepta el módulo que el ticket ya tenía, aunque hoy esté desactivado, eliminado o ya no tenga ese departamento ("referencia válida").
  - Mensajes: inexistente, eliminado o desactivado → 400 "El módulo no existe o está desactivado" (el actual). De otro departamento → 400 "El módulo no es del departamento del ticket".
  - `tickets.changeDepartment`: si el ticket tiene un módulo sin el nuevo departamento, `moduloId` queda en `null` en la misma escritura. El `AuditLog` `update` tiene en su diff `departamento` y `modulo`, antes y después.
  - `tickets.changeDepartment` conserva el módulo si tiene el nuevo departamento.
  - Los permisos son los de `tickets.create`, `update` y `changeDepartment` (SPEC 05): sin regla propia.
- **EDGE CASES:**
  - `changeDepartment` de un ticket sin módulo no cambia nada más.
  - `changeDepartment` de un ticket cuyo módulo está eliminado: se vacía igual, porque un módulo eliminado no tiene departamentos.
  - El filtro `moduloId` de `tickets.list` compara ids, no los valida (SPEC 06): sin cambios.
  - El admin le quita un departamento a un módulo mientras un agente de ese departamento tiene abierto el formulario del alta o de la edición con ese módulo elegido: al guardar, el agente recibe el 400 «El módulo no es del departamento del ticket». En la edición no pasa si el ticket ya tenía ese módulo (se acepta el que ya tenía).
  - Un departamento desactivado conserva sus módulos y sus tickets. Los tickets existentes siguen editándose con su módulo; los tickets nuevos no se crean en él, porque el selector de departamento ofrece solo los activos.
- **MUST NOT:** vaciar el módulo en `update` por su cuenta. `update` reemplaza todos los campos con lo que manda la web.

### Feature 11.5 — Web

- **MUST:**
  - `/admin/catalogos`, pestaña Módulos:
    - la tabla suma la columna «Departamentos», con los nombres separados por coma;
    - el panel de alta y edición suma «Departamentos» (obligatorio), con una casilla por departamento activo, más los desactivados que el módulo ya tiene, marcados «(inactivo)»;
    - enviar sin ninguna casilla no se envía y muestra «Elegí al menos un departamento.».
  - `CatalogOptionSelect` con `ruta="modulos"` recibe el departamento del ticket y ofrece solo los módulos activos que lo tienen.
  - El módulo actual que no está entre las opciones (desactivado, eliminado o sin ese departamento) se muestra marcado «(no disponible)».
  - Edición (`TicketForm`): el selector filtra por `ticket.departamento.id`.
  - Alta (`CreateTicketForm`):
    - el campo «Módulo» va en la sección «Datos del ticket», junto a Prioridad;
    - filtra por el departamento elegido;
    - deshabilitado mientras no haya departamento, con la pista «Elegí un departamento para cargar el módulo.»;
    - cambiar el departamento vacía el módulo.
  - Un error del servidor sobre `moduloId` se muestra bajo el campo.
  - `ChangeDepartmentDialog` (solo admin): si el ticket tiene módulo, muestra un aviso con su nombre: «Este ticket tiene el módulo «X». Si el nuevo departamento no lo tiene, el ticket queda sin módulo.». Si el ticket no tiene módulo, no muestra nada. El aviso no bloquea el cambio ni pide otra confirmación.
  - Después de `changeDepartment`, el detalle muestra el módulo ya vacío. No requiere código nuevo: `useChangeTicketDepartment` ya invalida `orpc.tickets` y el formulario se vuelve a montar con el ticket nuevo.
  - El filtro «Módulo» de la bandeja no cambia de código: muestra lo que devuelve `catalogs.modulos.list`, así que el agente ve los suyos y el admin todos.
- **EDGE CASES:**
  - Un agente cuyo departamento ya no tiene un módulo no puede filtrar la bandeja por él, aunque sus tickets viejos lo conserven: ya no figura entre las opciones. Una URL con ese `moduloId` filtra igual, pero el selector no muestra la opción elegida.
  - La caché de la lista de módulos se vacía al cerrar sesión (`useLogout`), así que otro usuario en la misma pestaña no hereda la lista del anterior. Si el admin cambia el departamento de un agente con la sesión abierta, la lista de ese agente se actualiza al recargar; el servidor valida igual al guardar.
- **MUST NOT:** acotar el filtro Módulo por el filtro Departamento de la bandeja.

### Feature 11.6 — Seed

- `seed-data/modulos.json` es opcional: si falta, el seed lo saltea con un aviso, como `areas.json`.
- Se carga después de los departamentos, y solo si `modulo` no tiene ninguna fila (regla de SPEC 04).
- Cada nombre de `departamentos` se busca por nombre normalizado en `organization`.
- El seed aborta antes de crear módulos, y nombra los valores, si pasa alguna de estas cosas:
  - un departamento no existe;
  - un módulo trae la lista vacía;
  - dos módulos tienen el mismo nombre normalizado.
- Cada módulo deja su `AuditLog` `create` con `actorId: null` y `departamentos` en `after`, por `CatalogsService.seedIfEmpty`.
- El seed informa "Módulos" creados o salteados, como los demás catálogos.

## Plan de implementación

1. **Esquema y migración.** Antes, borrar la carpeta vacía `packages/db/migrations/20261028120000_descripcion_catalogos/` (ver Riesgos). `ModuloDepartamento`, las relaciones inversas en `Modulo` y `Organization`, y `@@index([departamentoId, moduloId])` en `Ticket`; `prisma migrate dev --name modulos_departamentos`.

   Verificar:
   - la migración solo crea la tabla, su índice y sus FK, y el índice de `ticket`;
   - un segundo `migrate dev` no genera nada (en particular, no propone borrar los índices parciales escritos a mano).
2. **Contratos.** `moduloInputSchema` y `moduloSchema` en `catalogs.ts` (y `catalogsContract.modulos` con ellos), y `moduloId` en `createTicketInputSchema`. Verificar con los tests de `packages/contracts/test/`: un módulo sin `departamentoIds` o con la lista vacía se rechaza; un alta de ticket con `moduloId` en blanco da `null`.
3. **API, catálogo Módulos.**
   - `catalog-definitions.ts` declara la relación con departamentos (campo de entrada, relación leída, foto y mensaje del 400).
   - `CatalogsService` valida los departamentos, con la excepción de la edición.
   - `CatalogsRepository` escribe y lee `modulo_departamento`, y borra sus filas en `remove`.

   Verificar con `apps/api/test/catalogs/`:
   - alta con dos departamentos → la salida trae los dos, ordenados;
   - lista vacía o un departamento desactivado → 400;
   - editar conservando un departamento ya desactivado → 200;
   - quitar un departamento deja un `update` con `departamentos` en el diff;
   - una edición que solo reordena `departamentoIds` no audita;
   - eliminar el módulo borra sus filas.
4. **API, lista por alcance.** `catalogs-read.controller.ts` pasa `@CurrentUser()` a `list` de `modulos`, y el service filtra por `user.scope`. Verificar con tests: un agente de Redes recibe solo los módulos con Redes; el admin, todos; un agente sin departamento, `[]`.
5. **API, departamentos.** El lector nuevo en `src/common/`, provisto por `CatalogsModule`. `OrganizationsService.remove` lo usa. Verificar con `apps/api/test/organizations/`: departamento con un módulo → 409; después de quitárselo al módulo, o de eliminar el módulo → se elimina.
6. **API, tickets.**
   - `TicketsRepository` lee los departamentos del módulo al resolverlo.
   - `TicketsService.create` y `update` aplican Feature 11.4.
   - `changeDepartment` vacía el módulo en la misma escritura.

   Verificar con `apps/api/test/tickets/tickets.service.test.ts`:
   - alta con un módulo de otro departamento → 400;
   - edición conservando un módulo al que le quitaron el departamento → 200;
   - edición eligiendo uno nuevo de otro departamento → 400;
   - `changeDepartment` con un módulo sin el nuevo departamento → `modulo: null` y diff con `modulo`;
   - con un módulo de los dos departamentos → se conserva.
7. **Seed.** `seed-data.ts` suma `modulosSchema` (`{ nombre, departamentos }`). `seed.ts` carga los módulos después de los departamentos, con los abortos de Feature 11.6. Crear `seed-data/modulos.json` y documentarlo en `seed-data/README.md`.

   Verificar:
   - seed sobre una base vacía → los módulos con sus departamentos y su `AuditLog`;
   - con un departamento inexistente → aborta nombrándolo y no crea módulos;
   - segundo seed → "Módulos" salteados.
8. **Web, administración.** `catalog-kinds.ts` (columna «Departamentos» en Módulos) y el panel de Módulos con las casillas, siguiendo el patrón de los campos extra de Proveedor y Áreas. Los departamentos salen del mismo hook que usa `/admin/usuarios`. Verificar con tests de componente en `apps/web/test/catalogs/`: alta sin casillas muestra el error y no envía; la tabla muestra «Desarrollo, Redes»; un departamento desactivado ya asignado aparece marcado «(inactivo)».
9. **Web, tickets.**
   - `CatalogOptionSelect` filtra por departamento cuando la ruta es `modulos` y usa la marca «(no disponible)».
   - `TicketForm` le pasa el departamento del ticket.
   - `CreateTicketForm` suma el campo, deshabilitado sin departamento y vaciado al cambiarlo.
   - `ChangeDepartmentDialog` suma el aviso del módulo.
   - Actualizar los fixtures de `apps/web/test/fixtures/`.

   Verificar con `CatalogOptionSelect.test.tsx`, `TicketForm.test.tsx`, `CreateTicketForm.test.tsx` y `ChangeDepartmentDialog.test.tsx` (en `apps/web/test/tickets/components/`):
   - solo se ofrecen los módulos del departamento;
   - el módulo actual sin ese departamento se ve «(no disponible)»;
   - en el alta, cambiar el departamento vacía el módulo;
   - el diálogo muestra el aviso con el nombre del módulo si el ticket tiene uno, y no muestra ninguno si no tiene.
10. **Verify y Bruno.**
    - `scripts/verify/specs/11-modulos-departamento.mjs` con `defineSpec`, registrado en `scripts/verify/specs/index.mjs`.
    - Los `createItem("modulos")` de los verify 04, 05 y 06 mandan `departamentoIds`.
    - `bruno/catalogs/create.bru` y `update.bru` suman `departamentoIds` (con una variable nueva del entorno) y su documentación.
    - `bruno/tickets/create.bru` documenta el `moduloId` opcional (el cuerpo de ejemplo no lo manda, así que sigue válido).
    - El request de eliminar departamento de `bruno/organizations/` documenta el 409 por módulos.

    Verificar: `pnpm verify --spec 04,05,06,08,10,11` pasa.
11. **Documentación.**
    - `CLAUDE.md`: SPEC 11 en el estado del repositorio, `ModuloDepartamento`, la migración `modulos_departamentos`, el seed de módulos y `pnpm verify` de SPEC 01 a 11.
    - `apps/api/CLAUDE.md`: la relación con departamentos en Catálogos, el recorte de `catalogs.modulos.list`, la regla del módulo del ticket, el 409 de departamentos y el seed de módulos ("Módulos no se siembran" deja de ser cierto).
    - `packages/db/CLAUDE.md`: el modelo y la migración.
    - `docs/prd.md`:
      - §4.2: el agente lee solo los módulos de su departamento;
      - §5 y §8: Módulo con departamentos en la descripción de los catálogos;
      - §6: la fila `modulo` del modelo del ticket, y el flujo del alta (el módulo ya no queda siempre "sin asignar hasta una edición posterior");
      - P22: Módulos ya no arrancan vacíos, los carga `seed-data/modulos.json`.
    - `docs/checklist-permisos.md`: la fila de `catalogs.modulos.list` para un agente.
    - `docs/despliegue.md`: una sección «Deploy que trae los módulos por departamento (SPEC 11)», con el formato de la de SPEC 08:
      - producción no tiene módulos, así que después de la migración se corre el seed (`node dist/seed.mjs`) para cargar `modulos.json`;
      - un departamento que se cree después empieza sin módulos: el admin lo tilda en cada módulo desde **Catálogos → Módulos**.
    - `specs/00-catalogo-specs.md`: la fila de SPEC 11.

    Verificar: `pnpm turbo lint typecheck test build` pasa.

## Criterios de aceptación

- [X] Después de `prisma migrate deploy`, existe la tabla `modulo_departamento` con clave `(moduloId, organizationId)`, `ticket` tiene el índice `(departamentoId, moduloId)`, y un segundo `migrate dev` no genera nada.
- [X] `catalogs.modulos.create` con `departamentoIds` de Desarrollo y Redes devuelve 200, con `departamentos` con los dos.
- [X] `catalogs.modulos.create` sin `departamentoIds`, con `[]` o con un departamento desactivado devuelve 400.
- [X] Editar un módulo conservando un departamento que se desactivó después devuelve 200.
- [X] Quitarle un departamento a un módulo deja un `AuditLog` `update` cuyo diff tiene `departamentos` antes y después. Reenviar los mismos departamentos en otro orden responde 200 y no deja `AuditLog`.
- [X] Un agente de Redes recibe en `catalogs.modulos.list` solo los módulos que tienen Redes, activos e inactivos, cada uno con todos sus departamentos. El admin recibe todos. Un agente sin departamento recibe `[]`.
- [X] Eliminar un módulo borra sus filas de `modulo_departamento`; un módulo con un ticket no eliminado sigue dando 409.
- [X] Eliminar un departamento asignado a un módulo devuelve 409. Después de eliminar ese módulo, eliminar el departamento devuelve 200.
- [X] `tickets.create` con un `moduloId` que no tiene el departamento del ticket devuelve 400 "El módulo no es del departamento del ticket". Con uno que lo tiene, 200, y `tickets.get` lo trae. Con un módulo desactivado o inexistente, 400 «El módulo no existe o está desactivado».
- [X] `tickets.update` eligiendo un módulo nuevo de otro departamento devuelve 400. Guardar un ticket cuyo módulo actual ya no tiene su departamento, sin cambiarlo, devuelve 200.
- [X] `tickets.changeDepartment` de Técnico a Redes, con un módulo que solo tiene Técnico, deja `modulo: null` y un `AuditLog` `update` con `departamento` y `modulo` en el diff. Con un módulo de Técnico y Redes, el módulo se conserva.
- [X] En la web, la pestaña Módulos muestra la columna «Departamentos», y el panel no envía un módulo sin ninguna casilla tildada.
- [X] En la web, el selector de módulo de la edición ofrece solo los módulos del departamento del ticket, y el actual que no está entre ellos se ve «(no disponible)».
- [X] En la web, el alta tiene el campo «Módulo», deshabilitado sin departamento, y cambiar el departamento lo vacía.
- [X] En la web, el diálogo «Cambiar departamento» de un ticket con módulo muestra el aviso con el nombre del módulo, y el de un ticket sin módulo no muestra ningún aviso.
- [X] En la web, el filtro «Módulo» de la bandeja de un agente de Redes ofrece solo los módulos que tienen Redes; el del admin ofrece todos.
- [X] El seed sobre una base vacía crea los módulos de `seed-data/modulos.json` con sus departamentos. Con un departamento inexistente, aborta nombrándolo y no crea módulos. Sin `modulos.json`, lo saltea con un aviso y termina bien.
- [X] `docs/prd.md` (§4.2, §5, §6, §8 y P22), `docs/checklist-permisos.md`, `docs/despliegue.md` y `bruno/` reflejan el cambio.
- [X] `pnpm verify --spec 04,05,06,08,10,11` y `pnpm turbo lint typecheck test build` terminan con código 0.

## Decisiones

- **Sí:** uno o más departamentos por módulo, al menos uno obligatorio (decisión del usuario, 2026-10-29). Un módulo que no debe usarse se desactiva, como hoy.
- **No:** un módulo sin departamentos. Sería una segunda forma de desactivar, invisible en la tabla.
- **Sí:** una tabla de unión explícita `ModuloDepartamento`. Permite `Restrict` hacia `Organization` (la FK respalda el 409) y un nombre de tabla propio.
- **No:** la relación implícita de Prisma (`_ModuloToOrganization`). Borra en cascada de los dos lados y no deja elegir el nombre.
- **No:** copiar un módulo por departamento («Servidores» de Desarrollo y «Servidores» de Redes). Duplica el ítem y rompe la unicidad del nombre.
- **Sí:** la base arranca de cero; la migración no asigna departamentos (decisión del usuario, 2026-10-29). Los módulos se cargan con el seed.
- **Sí:** producción no tiene módulos cargados (decisión del usuario, 2026-10-29), así que el deploy corre el seed y no hay nada que reasignar. `docs/despliegue.md` lo deja escrito.
- **Sí:** `seed-data/modulos.json` en git (decisión del usuario, 2026-10-29). Los nombres de módulos no son datos personales.
- **Sí:** el servidor valida el módulo contra el departamento del ticket (decisión del usuario, 2026-10-29). Sin eso, la API o Bruno guardarían cualquiera.
- **Sí:** el módulo que el ticket ya tenía se acepta siempre ("referencia válida", SPEC 05). Si no, quitarle un departamento al módulo bloquearía guardar esos tickets, porque `update` reemplaza todos los campos.
- **Sí:** `changeDepartment` vacía el módulo si no es del nuevo departamento (decisión del usuario, 2026-10-29). El historial conserva el valor anterior.
- **No:** conservarlo, ni rechazar el cambio con 409. Lo primero deja un ticket incoherente; lo segundo obliga a un paso manual.
- **Sí:** el diálogo «Cambiar departamento» avisa del módulo (decisión del usuario, 2026-10-29). El aviso es genérico («si el nuevo departamento no lo tiene…») porque la regla es condicional, y no depende de qué departamento se elija.
- **No:** que el aviso calcule si el módulo se pierde con el departamento elegido. Obligaría al diálogo a cruzar los departamentos del módulo; no hace falta para avisar.
- **Sí:** `catalogs.modulos.list` recortado para el agente en la API (decisión del usuario, 2026-10-29). Es el pedido original: hoy cualquier usuario ve la lista completa. El recorte va en la API, como el de los tickets: es un poco más de trabajo, pero deja la regla en un solo lugar.
- **No:** recortar solo en la pantalla. La regla quedaría repetida en cada componente, y la API (o Bruno) le seguiría devolviendo todos los módulos a un agente.
- **Sí:** el selector del ticket acota en la web por el departamento del ticket. No es el recorte por permisos, que ya hizo la API: es para el admin, que recibe todos los módulos y trabaja tickets de cualquier departamento.
- **No:** un parámetro `departamentoId` en `catalogs.modulos.list` para el admin (decisión del usuario, 2026-10-29). Son decenas de módulos, y la API ya valida al guardar.
- **Sí:** cada módulo trae todos sus departamentos, también para el agente. Saber que «Servidores» es también de Desarrollo no expone nada sensible, y evita dos formas de salida.
- **Sí:** el filtro «Módulo» de la bandeja sale de la misma lista, sin acotarlo por el filtro Departamento (decisión del usuario, 2026-10-29). Es la misma regla que Tipo de área y Área en SPEC 08.
- **Sí:** 409 al eliminar un departamento usado por un módulo (decisión del usuario, 2026-10-29). Es la misma regla que "lo usa un ticket".
- **No:** borrar la relación en cascada. Dejaría módulos sin departamento.
- **Sí:** el 409 de ese caso es genérico, sin nombrar los módulos (decisión del usuario, 2026-10-29). Igual que «lo usa un ticket» y «lo usa un área»; el lector solo cuenta, y la pestaña Módulos muestra qué departamentos tiene cada uno.
- **Sí:** eliminar un módulo borra sus filas de unión. Si no, un módulo eliminado (que ya no se puede editar) bloquearía para siempre la eliminación de su departamento.
- **Sí:** casillas en el panel lateral (decisión del usuario, 2026-10-29: "al cargar un módulo, elegir los departamentos a los que pertenece"). No hace falta un componente nuevo.
- **Sí:** la marca «(no disponible)» para el módulo actual que no se ofrece (decisión del usuario, 2026-10-29). Cubre desactivado, eliminado y de otro departamento. Los demás catálogos siguen con «(inactivo)».
- **Sí:** el campo «Módulo» en el alta (decisión del usuario, 2026-10-29). Filtra por el departamento elegido y se vacía al cambiarlo.
- **Sí:** el índice `(departamentoId, moduloId)` en `ticket`, en la misma migración (decisión del usuario, 2026-10-29). El filtro por módulo de la bandeja va a usarse, y el del agente siempre va acotado por departamento.
- **No:** un índice solo sobre `moduloId`. El filtro del admin sin departamento no usa el compuesto, pero con el volumen del PRD no hace falta; si se nota, va en una migración aparte.
- **Sí:** SPEC 11 no depende del campo `descripcion` de Módulo y Tipo de ticket (decisión del usuario, 2026-10-29). Ese trabajo no está en el repo, y va en otro cambio.
- **Sí:** archivo propio de `pnpm verify`, como cada SPEC desde el 02.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| En una base con módulos (desarrollo), después de la migración ninguno tiene departamento: desaparecen de los selectores y de la lista del agente, y el seed no los recarga porque la tabla no está vacía. | Decisión explícita: la base arranca de cero. En desarrollo, `prisma migrate reset` y el seed. Producción no tiene módulos. Si algún entorno los tuviera, el admin edita cada uno y elige al menos un departamento. |
| Un departamento creado después de la migración empieza sin módulos: sus agentes ven la lista vacía hasta que el admin lo tilda en cada módulo. | Nota en `docs/despliegue.md`. No hay asignación masiva (fuera de alcance). |
| Un agente no puede filtrar la bandeja por un módulo que su departamento perdió, aunque sus tickets viejos lo conserven. | Aceptado: es raro, los tickets siguen visibles y el módulo se sigue mostrando en el detalle como «(no disponible)». |
| La lista de módulos del selector queda vieja en una pestaña abierta si el admin cambia los departamentos del usuario o del módulo. | El servidor valida al guardar y responde 400 con un mensaje claro. El cierre de sesión vacía la caché (`useLogout`). |
| El service genérico de catálogos crece con una relación propia de Módulos. | Se declara en la definición (`links`), no con un `if` por catálogo. Los tests cubren Módulos y un catálogo simple por separado. |
| Los verify 04, 05 y 06 crean módulos sin departamentos y se rompen. | El paso 10 los actualiza, y el criterio de aceptación corre los verify juntos. |
| Eliminar un departamento compite con el alta de un módulo en ese departamento: la FK `Restrict` responde 500 en lugar de 409. | Mismo límite conocido que con los tickets (`apps/api/CLAUDE.md`). Se documenta junto a ese. |
| Un `migrate dev` futuro propone borrar los índices parciales escritos a mano. | El paso 1 verifica que un segundo `migrate dev` no genera nada. |
| Queda la carpeta vacía `packages/db/migrations/20261028120000_descripcion_catalogos/` (sin `migration.sql`), resto de un trabajo que no se commiteó. Prisma puede fallar al leer una carpeta de migración sin archivo (no se comprobó). | El paso 1 la borra antes de generar la migración. Git no la versiona (está vacía), así que solo existe en esta copia local. |

## Qué **no** está en este spec

- Acotar el filtro Módulo por el filtro Departamento de la bandeja.
- Recortar por departamento otros catálogos.
- Asignar departamentos a módulos de una base con datos.
- Que el seed complete una tabla de módulos con filas.
- Orden de módulos propio por departamento.
- Asignación masiva de departamentos a módulos.
- Módulos que dependan del área, del tipo de ticket o de otro catálogo.

Cada uno, si hace falta, va en su propio spec.
