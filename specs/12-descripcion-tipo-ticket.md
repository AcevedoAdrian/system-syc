# SPEC 12 — Descripción del tipo de ticket, seed y tipo en el alta

> **Status:** Approved
> **Depends on:** SPEC 03 (auditoría y eliminación lógica), SPEC 04 (catálogos y seed), SPEC 05 (tickets núcleo), SPEC 09 (sistema visual: el formulario del alta), SPEC 11 (módulos por departamento: el campo «Módulo» del alta y su verify, que se corre junto)
> **Date:** 2026-10-29
> **Objective:** que el tipo de ticket tenga una descripción opcional, que se cargue con un seed inicial, y que el alta del ticket permita elegir el tipo (mostrando esa descripción como ayuda) en la grilla «Tipo de ticket · Módulo» con «Prioridad · Fecha de recepción» debajo.

## Por qué existe este spec

Hoy `TipoTicket` es un catálogo simple (nombre, orden, activo): quien carga un ticket no tiene forma de saber qué incluye cada tipo, y el tipo ni siquiera se puede elegir en el alta: `createTicketInputSchema` no tiene `tipoId` y se completa recién al editar. Además, los tipos no se siembran (hoy el admin los carga a mano en cada base).

Este spec resuelve las tres cosas juntas porque se tocan entre sí: la descripción solo sirve si se ve donde se elige el tipo, y el seed necesita el campo para cargarla.

Decisiones del usuario del 2026-10-29:

- La descripción es un campo del tipo de ticket (catálogo), opcional, de hasta 500 caracteres.
- Se muestra en el alta como texto de ayuda bajo el selector «Tipo de ticket», una vez elegido el tipo. No se guarda en el ticket: el ticket ya tiene su propia «Descripción».
- «Tipo de ticket» es opcional en el alta («Sin asignar»), igual que «Módulo».
- El orden del alta queda: «Tipo de ticket» y «Módulo» en una fila; «Prioridad» y «Fecha de recepción» debajo.
- Hay un seed de tipos de ticket con nombre y descripción, en git. El contenido real lo da el usuario al implementar.

## Alcance

**Dentro:**

- Columna `descripcion String?` en `TipoTicket` y la migración `descripcion_tipo_ticket`.
- Contratos:
  - en `packages/contracts/src/catalogs.ts`, `tipoTicketInputSchema` (con `descripcion`) y `tipoTicketSchema` (con `descripcion`), usados por `catalogsContract.tipos`;
  - en `packages/contracts/src/tickets.ts`, `tipoId` en `createTicketInputSchema`.
- `catalogs` en la API: la definición de `tipos` declara `descripcion` en `inputFields` y `snapshotFields`; el historial del catálogo la audita.
- `tickets` en la API: `create` acepta `tipoId` y lo valida con la misma regla que ya usa `update`.
- Web:
  - `/admin/catalogos`, pestaña Tipos de ticket: columna «Descripción» y campo «Descripción» en el panel;
  - `CreateTicketForm`: campo «Tipo de ticket», la ayuda con la descripción y el nuevo orden de la sección «Datos del ticket».
- Seed: `seed-data/tipos-ticket.json` (en git) y su carga.
- `scripts/verify/specs/12-descripcion-tipo-ticket.mjs`, registrado en `scripts/verify/specs/index.mjs`.
- Bruno: `bruno/tickets/create.bru` documenta el `tipoId` opcional del alta; los requests de `bruno/catalogs/` de tipos documentan `descripcion`.
- Documentación: `CLAUDE.md`, `apps/api/CLAUDE.md`, `packages/db/CLAUDE.md`, `docs/prd.md`, `docs/despliegue.md`, `seed-data/README.md` y `specs/00-catalogo-specs.md`.

**Fuera de alcance (para otros specs):**

- Descripción en otros catálogos (Módulo, Prioridad, Área…). El resto de los catálogos queda como está.
- Mostrar la descripción en la edición del ticket (`TicketForm`), en la bandeja, en el filtro «Tipo» o en el detalle. Solo el alta.
- Cambiar el orden o el diseño de la edición del ticket.
- Hacer obligatorio el tipo en el alta, o en cualquier otro momento.
- Que el seed complete una tabla `tipo_ticket` que ya tiene filas, o que actualice la descripción de tipos existentes.
- Texto con formato (Markdown, saltos de línea con estilo): la descripción es texto plano.
- Recortar los tipos por departamento (como SPEC 11 con los módulos).

## Modelo de datos

`packages/db/schema.prisma`, en `model TipoTicket`, después de `deletedAt`:

```prisma
descripcion       String? // texto libre, hasta 500; en blanco = null
```

Migración `descripcion_tipo_ticket`, generada por `prisma migrate dev`:

```sql
ALTER TABLE "tipo_ticket" ADD COLUMN "descripcion" TEXT;
```

Sin índice: no se busca ni se filtra por descripción. Los tipos existentes quedan con `null`.

Contratos (fragmento, `packages/contracts/src/catalogs.ts`):

```ts
// SPEC 12: el tipo de ticket suma una descripción opcional, que se muestra en el alta del ticket.
export const tipoTicketInputSchema = catalogItemInputSchema.extend({
  descripcion: blankToNull(z.string().max(500)),
});
export const tipoTicketSchema = catalogItemSchema.extend({ descripcion: z.string().nullable() });
// catalogsContract.tipos = catalogContract("tipos", tipoTicketInputSchema, tipoTicketSchema)
```

```ts
// packages/contracts/src/tickets.ts (fragmento)
// createTicketInputSchema suma `tipoId: idOpcionalSchema`
```

`update` de un catálogo reemplaza todos los campos editables (SPEC 04): una `descripcion` ausente o en blanco se guarda como `null`.

Seed (`seed-data/tipos-ticket.json`, en git; el orden del archivo es el `orden`):

```json
[{ "nombre": "Incidente", "descripcion": "Algo que funcionaba dejó de funcionar." }]
```

El contenido real lo da el usuario al implementar: `/spec-impl` se lo pide en el paso 5. Si no lo da, el archivo sale con este ejemplo. `descripcion` es opcional en cada entrada.

Convenciones:

- `AuditLog.entityType` sigue siendo `"TipoTicket"`; la foto auditable suma `descripcion`, así que editarla deja un `update` con su diff.
- Una edición que solo cambia espacios de los extremos de la descripción no tiene cambios efectivos: 200 sin escribir ni auditar (regla de SPEC 04).

## Contrato

### Feature 12.1 — Descripción del tipo de ticket

- **MUST:**
  - `catalogs.tipos.create` y `update` aceptan `descripcion` opcional.
  - Se recortan los espacios de los extremos; en blanco o ausente se guarda `null`. Más de 500 caracteres → 400.
  - `list`, `create`, `update` y `setActive` de `catalogs.tipos` devuelven `tipoTicketSchema`, con `descripcion` (`null` si no tiene).
  - `catalogs.tipos.list` lo sigue leyendo cualquier usuario con sesión: la descripción no es sensible y la web la necesita en el alta.
  - La foto auditable de `TipoTicket` incluye `descripcion`: alta, edición y vaciado dejan su diff en el historial del catálogo.
  - El nombre sigue siendo único en todo el catálogo; la descripción no participa de la unicidad.
  - Los permisos son los de los catálogos (SPEC 04): sin regla propia.
- **EDGE CASES:**
  - Los tipos que ya existen en una base quedan con `descripcion: null`; la migración no los toca.
  - `move` y `setActive` no cambian la descripción.
  - Un tipo desactivado conserva su descripción.
- **MUST NOT:** agregar `descripcion` a los otros siete catálogos; guardar la descripción del tipo en el ticket.

### Feature 12.2 — Tipo en el alta del ticket (API)

- **MUST:**
  - `tickets.create` acepta `tipoId` opcional. Si viene, el tipo tiene que existir, no estar eliminado y estar activo; si no → 400 "El tipo de ticket no existe o está desactivado" (el mensaje que `update` ya usa).
  - En blanco o ausente se guarda `null`.
  - `tickets.get` lo devuelve (ya lo hace).
  - La foto auditable del alta (`snapshotOf`) incluye el tipo, como ya la edición.
  - Los permisos son los de `tickets.create` (SPEC 05): sin regla propia.
- **EDGE CASES:**
  - Un alta sin `tipoId` (Bruno, los verify de SPEC 05 a 11) sigue siendo válida.
  - `tickets.update` no cambia: sigue aceptando el tipo que el ticket ya tenía aunque hoy esté desactivado ("referencia válida", SPEC 05).
- **MUST NOT:** exigir el tipo en el alta; cambiar `tickets.update`.

### Feature 12.3 — Web: administración

- **MUST:**
  - `/admin/catalogos`, pestaña Tipos de ticket:
    - la tabla suma la columna «Descripción», con «—» si no tiene;
    - el panel de alta y edición suma el campo «Descripción» (opcional, área de texto, contador hasta 500), debajo del nombre;
    - un error del servidor se muestra en el panel, como los demás.
  - Las demás pestañas no cambian.
- **EDGE CASES:** una descripción larga se corta en la tabla (no ensancha la fila); el panel muestra el texto entero.

### Feature 12.4 — Web: alta del ticket

- **MUST:**
  - La sección «Datos del ticket» de `/tickets/nuevo` queda en este orden, después de «Título»:
    1. fila de dos: «Tipo de ticket» y «Módulo»;
    2. fila de dos: «Prioridad» y «Fecha de recepción»;
    3. «Descripción» del ticket (sin cambios).
  - En pantallas angostas la grilla apila en el mismo orden: Tipo, Módulo, Prioridad, Fecha.
  - «Tipo de ticket» es un `CatalogOptionSelect` de `ruta="tipos"`, opcional: «Sin asignar» como primera opción y marcador «Sin asignar».
  - Al elegir un tipo con descripción, esta aparece como texto de ayuda bajo el campo. Sin tipo elegido, o con un tipo sin descripción, no se muestra ayuda.
  - Cambiar o quitar el tipo cambia o quita la ayuda al instante, sin otra llamada a la API (sale de la misma lista que llena el selector).
  - Un error del servidor sobre el tipo ("El tipo de ticket no existe o está desactivado") se muestra bajo el campo, no solo en la barra de acciones (mismo patrón que `isModuloError`).
  - «Prioridad» sigue siendo obligatorio; «Fecha de recepción» conserva el botón «Hoy» y su regla de no futura; «Módulo» conserva su dependencia del departamento.
- **EDGE CASES:**
  - La lista de tipos todavía no llegó: el campo se muestra sin ayuda y sin error.
  - Un tipo que el admin desactiva con el formulario abierto: al guardar el servidor responde 400 y se muestra bajo el campo.
- **MUST NOT:** mostrar la ayuda en la edición ni en el detalle; sumar un campo al ticket para guardar la descripción.

### Feature 12.5 — Seed

- `seed-data/tipos-ticket.json` es opcional: si falta, el seed lo saltea con un aviso, como `edificios.json`.
- Es una lista de `{ nombre, descripcion? }`; el orden del archivo es el `orden`.
- Se carga solo si `tipo_ticket` no tiene ninguna fila, ni siquiera eliminada (regla de SPEC 04).
- Cada tipo deja su `AuditLog` `create` con `actorId: null` y `descripcion` en `after`, por `CatalogsService.seedIfEmpty`.
- El seed aborta antes de crear nada, nombrando los valores, si dos tipos tienen el mismo nombre normalizado (el índice único rechazaría el segundo a mitad de la carga).
- El seed informa «Tipos de ticket» creados o salteados, como los demás catálogos.

## Plan de implementación

1. **Esquema y migración.** `descripcion String?` en `TipoTicket`; `prisma migrate dev --name descripcion_tipo_ticket`.

   Verificar:
   - la migración solo tiene el `ADD COLUMN`;
   - un segundo `migrate dev` no genera nada (en particular, no propone borrar los índices parciales escritos a mano).
2. **Contratos.** `tipoTicketInputSchema` y `tipoTicketSchema` en `catalogs.ts` (y `catalogsContract.tipos` con ellos), y `tipoId` en `createTicketInputSchema`. Verificar con los tests de `packages/contracts/test/`: `descripcion` en blanco → `null`; con espacios en los extremos → recortada; 501 caracteres → error; un alta de ticket con `tipoId` en blanco da `null`.
3. **API, catálogo Tipos.** `catalog-definitions.ts` declara `descripcion` en `inputFields` y `snapshotFields` de `tipos`. `CatalogsService.seedIfEmpty` acepta `descripcion` en sus ítems y la escribe junto con `nombre`. Verificar con `apps/api/test/catalogs/catalogs.service.test.ts`:
   - alta con descripción → la salida la trae;
   - alta sin ella → `null`;
   - editar solo la descripción deja un `update` con `descripcion` en el diff;
   - una edición que solo cambia espacios no audita;
   - los otros catálogos no aceptan ni devuelven `descripcion`.
4. **API, alta con tipo.** `TicketsService.create` resuelve `tipoId` con el mismo helper que `update` (mensaje `MESSAGES.tipo`), y `TicketsRepository.create` lo escribe. Verificar con `apps/api/test/tickets/tickets.service.test.ts`:
   - alta con tipo activo → `tickets.get` lo trae;
   - tipo inexistente, eliminado o desactivado → 400 con el mensaje;
   - alta sin tipo → `null`;
   - el `AuditLog` `create` incluye el tipo.
5. **Seed.** `seed-data.ts` suma `tiposTicketSchema` (`{ nombre, descripcion? }`); `seed.ts` carga los tipos de ticket y informa «Tipos de ticket». Crear `seed-data/tipos-ticket.json` y documentarlo en `seed-data/README.md`. Verificar con `apps/api/test/seed/seed-data.test.ts` y a mano:
   - seed sobre una base vacía → los tipos con su descripción y su `AuditLog`;
   - dos tipos con el mismo nombre normalizado → aborta nombrándolos y no crea tipos;
   - segundo seed → «Tipos de ticket» salteados;
   - sin el archivo → aviso y el seed termina bien.
6. **Web, administración.** `CatalogTable.tsx` suma la columna «Descripción» para `tipos` (patrón de las columnas de Proveedores). Un diálogo propio de Tipos de ticket (por ejemplo `TipoTicketFormDialog.tsx`, siguiendo `ProveedorFormDialog.tsx`) con el área de texto, enganchado en `CatalogsAdmin.tsx`. Verificar con tests de componente en `apps/web/test/catalogs/`: la tabla muestra la descripción y «—» si falta; el panel envía la descripción; una de 501 caracteres no se envía.
7. **Web, alta.** `CreateTicketForm.tsx`: campo «Tipo de ticket», ayuda con la descripción (sale de `useCatalogOptions("tipos")`; si el tipo de las opciones no expone `descripcion`, ajustarlo), nuevo orden de las dos filas, y el error del servidor sobre el tipo bajo su campo (un `isTipoError` junto a `modulo-error.ts`, o su generalización). Actualizar los fixtures de `apps/web/test/fixtures/`. Verificar con `CreateTicketForm.test.tsx` (en `apps/web/test/tickets/components/`):
   - el orden de los campos es Tipo, Módulo, Prioridad, Fecha de recepción;
   - al elegir un tipo con descripción aparece la ayuda, y al pasar a «Sin asignar» o a un tipo sin descripción desaparece;
   - el alta manda `tipoId` (y `""` → `null`);
   - un 400 sobre el tipo se muestra bajo el campo.
8. **Verify y Bruno.**
   - `scripts/verify/specs/12-descripcion-tipo-ticket.mjs` con `defineSpec`, registrado en `scripts/verify/specs/index.mjs`.
   - `bruno/tickets/create.bru` documenta el `tipoId` opcional (el cuerpo de ejemplo no lo manda, así que sigue válido); los requests de tipos de `bruno/catalogs/` documentan `descripcion`.

   Verificar: `pnpm verify --spec 04,05,06,11,12` pasa.
9. **Documentación.**
   - `CLAUDE.md`: SPEC 12 en el estado del repositorio, `TipoTicket.descripcion` (migración `descripcion_tipo_ticket`), el seed de tipos de ticket y `pnpm verify` de SPEC 01 a 12.
   - `apps/api/CLAUDE.md`: la `descripcion` en Catálogos, el `tipoId` del alta y el seed de tipos de ticket («Tipos de ticket y Proveedores no se siembran» pasa a «Proveedores no se siembran»).
   - `packages/db/CLAUDE.md`: el campo y la migración.
   - `docs/prd.md`: la descripción de los catálogos (§5 y §8, `TipoTicket` con su descripción), la fila del tipo en §6 y el flujo del alta (el tipo ya no se completa solo al editar).
   - `docs/despliegue.md`: una sección «Deploy que trae la descripción del tipo de ticket (SPEC 12)», con el formato de la de SPEC 11:
     - si producción ya tiene tipos de ticket, el seed no los toca (la tabla no está vacía): el admin carga la descripción de cada uno desde **Catálogos → Tipos de ticket**;
     - si no tiene, después de la migración se corre el seed (`node dist/seed.mjs`).
   - `seed-data/README.md` (ya en el paso 5) y `specs/00-catalogo-specs.md`: la fila de SPEC 12.

   Verificar: `pnpm turbo lint typecheck test build` pasa.

## Criterios de aceptación

- [ ] Después de `prisma migrate deploy`, la tabla `tipo_ticket` tiene la columna `descripcion` nullable, y los tipos existentes la tienen en `null`. Un segundo `migrate dev` no genera nada.
- [ ] `catalogs.tipos.create` con `descripcion: "Algo falló"` devuelve 200 con esa descripción, y `catalogs.tipos.list` la trae. Sin `descripcion`, o con `"   "`, devuelve `descripcion: null`.
- [ ] `catalogs.tipos.create` con una descripción de 501 caracteres devuelve 400. Con `"  Texto  "` guarda `"Texto"`.
- [ ] Cambiar solo la descripción de un tipo deja un `AuditLog` `update` cuyo diff tiene `descripcion` antes y después. Reenviar la misma descripción con espacios en los extremos responde 200 y no deja `AuditLog`.
- [ ] Los otros siete catálogos no devuelven `descripcion`.
- [ ] `tickets.create` con un `tipoId` activo devuelve 200 y `tickets.get` trae ese tipo. Con uno inexistente, eliminado o desactivado devuelve 400 "El tipo de ticket no existe o está desactivado". Sin `tipoId` devuelve 200 con tipo `null`.
- [ ] El `AuditLog` `create` del ticket incluye el tipo cuando se mandó.
- [ ] En la web, la tabla de Tipos de ticket tiene la columna «Descripción» («—» si no tiene), y el panel guarda la descripción y no envía una de más de 500 caracteres.
- [ ] En la web, el alta de ticket muestra en este orden los campos «Tipo de ticket», «Módulo», «Prioridad», «Fecha de recepción», con los dos primeros en una fila y los dos últimos en otra debajo, y «Descripción» a continuación.
- [ ] En la web, elegir en el alta un tipo con descripción muestra esa descripción bajo el campo; elegir «Sin asignar» o un tipo sin descripción no muestra ayuda.
- [ ] En la web, el alta sin tipo ni módulo sigue creando el ticket, y con tipo lo guarda.
- [ ] El seed sobre una base vacía crea los tipos de `seed-data/tipos-ticket.json` con su descripción y su `AuditLog`. Con nombres repetidos, aborta nombrándolos y no crea tipos. Sin el archivo, lo saltea con un aviso y termina bien. Un segundo seed los saltea.
- [ ] `docs/prd.md`, `docs/despliegue.md`, `seed-data/README.md` y `bruno/` reflejan el cambio.
- [ ] `pnpm verify --spec 04,05,06,11,12` y `pnpm turbo lint typecheck test build` terminan con código 0.

## Decisiones

- **Sí:** la descripción vive en el catálogo `TipoTicket` (decisión del usuario, 2026-10-29). Es una propiedad del tipo, igual para todos los tickets de ese tipo.
- **No:** copiarla al ticket al elegir el tipo. El ticket ya tiene «Descripción» propia; duplicarla confundiría y la dejaría desactualizada si el admin edita el tipo.
- **Sí:** opcional, hasta 500 caracteres (decisión del usuario, 2026-10-29). No obliga a cargar los tipos existentes y alcanza para una explicación de un párrafo.
- **No:** obligatoria. Exigiría un valor por defecto en la migración para los tipos que ya existen.
- **Sí:** se muestra como ayuda bajo el selector, una vez elegido el tipo (decisión del usuario, 2026-10-29). Es lo que el formulario ya hace con otros campos (`hint` de `Field`) y no obliga a abrir cada opción.
- **No:** mostrarla dentro de cada opción del desplegable. Es más pesado visualmente y requiere cambiar `CatalogOptionSelect` para un solo catálogo.
- **Sí:** «Tipo de ticket» opcional en el alta, «Sin asignar» (decisión del usuario, 2026-10-29). Es lo mismo que «Módulo», no cambia el contrato de `create` para quien no lo manda y no rompe los verify ni Bruno.
- **No:** obligarlo en el alta. Dejaría a la edición y al alta con reglas distintas, y los tickets viejos sin tipo seguirían siendo válidos igual.
- **Sí:** `tickets.create` valida el tipo con la misma regla de `update` (decisión del usuario, 2026-10-29). La API no confía en lo que mande la web.
- **Sí:** orden «Tipo · Módulo» y debajo «Prioridad · Fecha de recepción» (decisión del usuario, 2026-10-29). Agrupa los datos de clasificación arriba y los de gestión abajo; la fecha deja de estar sola en una fila.
- **No:** reordenar la edición del ticket. El pedido es del alta («a la hora de registrar un ticket»); la edición tiene su propio diseño por pestañas (SPEC 09).
- **Sí:** seed de tipos de ticket, en git, con el contenido real dado al implementar (decisión del usuario, 2026-10-29). Los nombres y descripciones de tipos no son datos personales, como `modulos.json`.
- **Sí:** el seed solo carga con la tabla vacía (regla de SPEC 04). No pisa un renombre ni una descripción que el admin editó.
- **No:** un seed que actualice la descripción de tipos existentes. Sería un segundo comportamiento del seed ("completar") que SPEC 11 también descartó; en una base con datos, la descripción se carga desde la pantalla.
- **Sí:** `catalogs.tipos.list` sigue siendo de lectura para cualquier usuario con sesión. La web la necesita en el alta, y la descripción no es sensible.
- **Sí:** archivo propio de `pnpm verify`, como cada SPEC desde el 02.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Una base que ya tiene tipos de ticket (desarrollo o producción) no recibe el seed, porque la tabla no está vacía: los tipos quedan sin descripción. | Decisión explícita (regla de SPEC 04). En desarrollo, `prisma migrate reset` y el seed. En una base con datos, el admin completa la descripción desde Catálogos. Queda escrito en `docs/despliegue.md`. |
| Una descripción de 500 caracteres alarga la ayuda bajo el selector y desalinea la fila «Tipo · Módulo». | La ayuda se ajusta en varias líneas y la grilla sigue siendo de dos columnas. El panel de administración muestra el contador para que el admin la mantenga corta. Si molesta, se acota en un spec aparte. |
| Los verify 05, 06, 08, 10 y 11 arman altas de ticket con un cuerpo fijo y fallan si el contrato cambia. | `tipoId` se acepta ausente en `create` (es `idOpcionalSchema`), así que esos cuerpos siguen válidos. El criterio de aceptación corre los verify juntos. |
| El tipo del alta se desactiva con el formulario abierto y el agente guarda con un tipo que ya no se ofrece. | El servidor responde 400 con un mensaje claro y la web lo muestra bajo el campo. |
| Un `migrate dev` futuro propone borrar los índices parciales escritos a mano. | El paso 1 verifica que la migración solo tiene el `ADD COLUMN` y que un segundo `migrate dev` no genera nada. |
| El service genérico de catálogos crece con un campo propio de Tipos de ticket. | Se declara en la definición (`inputFields` y `snapshotFields`), como los campos de Proveedor, no con un `if` por catálogo. Los tests cubren Tipos y otro catálogo simple por separado. |

## Qué **no** está en este spec

- Descripción en otros catálogos.
- La descripción del tipo en la edición, la bandeja, el filtro o el detalle del ticket.
- Tipo obligatorio en el alta.
- Un seed que complete o actualice tipos de una tabla con filas.
- Descripción con formato (Markdown).
- Tipos de ticket por departamento.

Cada uno, si hace falta, va en su propio spec.
