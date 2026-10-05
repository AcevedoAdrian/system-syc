# SPEC 04 — Catálogos

> **Status:** Draft
> **Depends on:** SPEC 03 (auditoría y eliminación lógica)
> **Date:** 2026-10-05
> **Objective:** módulo `catalogs` con el ABM de Área, Edificio, TipoTicket, Prioridad, Modulo, Proveedor y EstadoTicket (auditado, con eliminación lógica y orden por flechas), administrable por el admin desde una pantalla con pestañas y legible por cualquier usuario para los formularios de SPEC 05.

## Por qué existe este spec

PRD §5.1 exige "catálogos administrables desde la pantalla", y §10 los ubica en la etapa 3, antes de tickets núcleo: un ticket no se puede cargar sin prioridad y sin estado. Las respuestas Q13 a Q18 y la decisión D1 (`specs/00-catalogo-specs.md`) fijan la unicidad, el alcance global y la `clave` de los estados de sistema.

Esta versión (2026-10-05) ajusta el borrador original al código real de SPEC 02 y 03. Usa `PERMISSIONS.MANAGE`, `writeAuditEntry` dentro de la transacción, `notDeleted` y `softDeleteData`, `normalizeName`, el seed en `apps/api/src/seed.ts` y las pantallas bajo `routes/_authenticated/admin/`. Además cierra decisiones de UX (pestañas, flechas, estados de sistema) y agrega Prioridades al seed y a la regla de "al menos uno activo" (decisiones del usuario, 2026-10-05).

## Alcance

**Dentro:**

- Siete modelos Prisma (`Area`, `Edificio`, `TipoTicket`, `Prioridad`, `Modulo`, `Proveedor`, `EstadoTicket`) y la migración `catalogos`, con índice único parcial sobre el nombre normalizado.
- Módulo `apps/api/src/modules/catalogs`, uno solo para los 7 catálogos (PRD §8.2):
  - `catalog-definitions.ts`: un registro por catálogo con `entityType`, mensajes, foto auditable y reglas propias.
  - `catalogs.repository.ts` (única capa con Prisma) y `catalogs.service.ts` (genérico, recibe el catálogo).
  - `catalogs-read.controller.ts` (`list`, solo sesión) y `catalogs.controller.ts` (mutaciones e historial, `MANAGE`).
- Contrato `packages/contracts/src/catalogs.ts` (`contract.catalogs.<catálogo>.<procedimiento>`).
- Reordenar con `move` (subir o bajar una posición).
- Seed: los 7 estados (4 con `clave`) y 4 prioridades, cada catálogo solo si su tabla está vacía.
- `history` por catálogo en la API, solo para el admin y sin UI (como `users.history` y `organizations.history`).
- `apps/web`:
  - Ruta `/admin/catalogos` con una pestaña por catálogo y el link "Catálogos" en el sidebar.
  - `features/catalogs` con sus componentes y los hooks `useCatalog` y `useCatalogOptions`, que SPEC 05 y 06 consumen.
  - El primitivo `components/ui/tabs.tsx` (shadcn).
- Requests de Bruno en `bruno/catalogs/`.
- `scripts/verify/specs/04-catalogos.mjs` para `pnpm verify`.
- Actualizar `CLAUDE.md`, `apps/api/CLAUDE.md` y `docs/prd.md` donde este spec agrega reglas.

**Fuera de alcance (para specs futuros):**

- Tickets, sus formularios y el chequeo "ítem en uso por un ticket" al eliminar (SPEC 05; ver Feature 4.1).
- Filtros de la bandeja por catálogo (SPEC 06).
- UI de historial de catálogos y pantalla de auditoría global (Q11).
- Restaurar o listar ítems eliminados (Q12).
- Arrastrar y soltar para reordenar.
- Datos iniciales de Áreas, Edificios, Tipos, Módulos y Proveedores (los carga el admin).
- Campos personalizados creados por el admin (Fase 2, PRD §8.3).

## Modelo de datos

```prisma
// packages/db/schema.prisma (fragmento). Area, Edificio, TipoTicket, Prioridad y Modulo tienen
// exactamente esta forma: un modelo por catálogo, nunca una tabla genérica.
model Area {
  id                String    @id @default(cuid())
  nombre            String
  nombreNormalizado String    // normalizeName(nombre): lo calcula el service, nunca llega del cliente
  orden             Int       // lo asigna el service (máximo + 1 en el alta); solo cambia con `move`
  activo            Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  createdBy         String
  creador           User      @relation("AreaCreador", fields: [createdBy], references: [id], onDelete: Restrict)
  updatedBy         String
  editor            User      @relation("AreaEditor", fields: [updatedBy], references: [id], onDelete: Restrict)
  deletedAt         DateTime?

  @@map("area")
}

// Igual que Area, más los datos de contacto (todos opcionales).
model Proveedor {
  // ... campos de Area ...
  contacto  String?
  telefono  String?
  correo    String?
  sitioWeb  String?

  @@map("proveedor")
}

// Igual que Area, más la clave interna de los estados de sistema (D1).
model EstadoTicket {
  // ... campos de Area ...
  clave String? // "FINALIZADO" | "CERRADO" | "CANCELADO" | "REABIERTO" | null

  @@unique([clave]) // Postgres no compara los NULL entre sí: solo restringe las 4 claves
  @@map("estado_ticket")
}

// User suma solo las relaciones inversas (dos por catálogo: creador y editor), sin columnas nuevas.
```

Tablas: `area`, `edificio`, `tipo_ticket`, `prioridad`, `modulo`, `proveedor`, `estado_ticket`.

**Índice único parcial**, uno por tabla, en el SQL de la migración `catalogos`. Prisma no lo expresa en `@@unique` sin preview, así que el comentario de la migración explica por qué existe:

```sql
CREATE UNIQUE INDEX "area_nombreNormalizado_key" ON "area" ("nombreNormalizado") WHERE "deletedAt" IS NULL;
```

```ts
// packages/contracts/src/catalogs.ts (fragmento)
const nombreSchema = z.string().trim().min(1).max(120);
// Campo opcional de Proveedor: en blanco, ya recortado, se guarda como null.
const blankToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), schema.nullable());

export const catalogItemInputSchema = z.object({ nombre: nombreSchema });

export const proveedorInputSchema = z.object({
  nombre: nombreSchema,
  contacto: blankToNull(z.string().trim().max(120)),
  telefono: blankToNull(z.string().trim().max(50)),
  correo: blankToNull(z.string().trim().pipe(z.email().max(254))),
  sitioWeb: blankToNull(z.string().trim().pipe(z.url({ protocol: /^https?$/ }).max(500))),
});

export const catalogItemSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  orden: z.number().int(),
  activo: z.boolean(),
});
export const proveedorSchema = catalogItemSchema.extend({
  contacto: z.string().nullable(),
  telefono: z.string().nullable(),
  correo: z.string().nullable(),
  sitioWeb: z.string().nullable(),
});
export const claveEstadoSchema = z.enum(["FINALIZADO", "CERRADO", "CANCELADO", "REABIERTO"]);
// `clave` es de solo lectura: ninguna entrada la acepta.
export const estadoTicketSchema = catalogItemSchema.extend({ clave: claveEstadoSchema.nullable() });

export const moveCatalogItemInputSchema = z.object({
  itemId: z.string(),
  direccion: z.enum(["subir", "bajar"]),
});
```

**Procedimientos.** Cada catálogo expone los mismos siete, armados por una función del contrato. `<ruta>` es `areas`, `edificios`, `tipos`, `prioridades`, `modulos`, `proveedores` o `estados`:

| Procedimiento | Método y path | Entrada | Permiso |
|---|---|---|---|
| `list` | `GET /catalogs/<ruta>` | — | sesión |
| `create` | `POST /catalogs/<ruta>` | esquema de entrada del catálogo | `MANAGE` |
| `update` | `PATCH /catalogs/<ruta>/{itemId}` | `itemId` + esquema de entrada (reemplaza todos los campos editables) | `MANAGE` |
| `move` | `POST /catalogs/<ruta>/{itemId}/move` | `moveCatalogItemInputSchema` | `MANAGE` |
| `setActive` | `POST /catalogs/<ruta>/{itemId}/active` | `itemId`, `activo` | `MANAGE` |
| `remove` | `DELETE /catalogs/<ruta>/{itemId}` | `itemId` | `MANAGE` |
| `history` | `GET /catalogs/<ruta>/{itemId}/history` | `itemId` | `MANAGE` |

**Foto auditable** (SPEC 03): solo estos campos entran en el diff.

| `entityType` | Campos |
|---|---|
| `Area`, `Edificio`, `TipoTicket`, `Prioridad`, `Modulo` | `nombre`, `orden`, `activo` |
| `Proveedor` | los anteriores, más `contacto`, `telefono`, `correo` y `sitioWeb` |
| `EstadoTicket` | los anteriores de la base, más `clave` |

## Contrato

**Feature 4.1: ABM de los 7 catálogos**

- **MUST:**
  - Todos los catálogos son globales: una sola lista de cada uno para los 4 departamentos (Q15).
  - `list` la puede usar cualquier usuario con sesión, porque los formularios de SPEC 05 y los filtros de SPEC 06 la necesitan. Devuelve los ítems no eliminados, activos e inactivos, ordenados por `orden` y luego por `nombre`. Los eliminados nunca aparecen (`notDeleted`).
  - Solo el admin crea, edita, mueve, activa, desactiva, elimina y lee el historial (PRD §4.2, `PERMISSIONS.MANAGE`). Un agente recibe 403.
  - El nombre es único dentro de cada catálogo, no entre catálogos. Se compara con `normalizeName` (`src/common/text.ts`): recortado, sin mayúsculas, sin acentos y con los espacios internos colapsados. Cuentan los ítems activos e inactivos; un eliminado libera el nombre (Q14). El service chequea antes de escribir (409 con mensaje); el índice parcial cubre la carrera, y el repository traduce esa violación a 409.
  - `nombreNormalizado` se recalcula en cada alta y edición a partir de `nombre`. Nunca llega del cliente.
  - El alta deja el ítem activo, con `orden` = máximo `orden` de los no eliminados del catálogo + 1 (o 1 si está vacío).
  - Desactivar (`activo = false`) saca al ítem de `useCatalogOptions`, pero los tickets que ya lo eligieron lo siguen mostrando. Se puede reactivar (Q13).
  - Eliminar es lógico (`softDeleteData`). En este spec no hay tickets, así que siempre procede, salvo las reglas de Feature 4.4. SPEC 05 agrega en `CatalogsService.remove` el rechazo con 409 cuando un ticket no eliminado usa el ítem (Q13, SPEC 03 Feature 3.4).
  - Auditoría (SPEC 03): cada mutación escribe su `AuditLog` con `writeAuditEntry` en la misma transacción.
    - Alta: `create` con `{ after }`.
    - Edición, activación y desactivación: `update` con el diff.
    - Eliminación: `delete` con `{}`.
  - `createdBy` y `updatedBy` salen de `@CurrentUser()`, y en el alta `updatedBy = createdBy`.
  - `history` devuelve `AuditService.history(entityType, itemId)` y no chequea que el ítem exista (Feature 3.2 de SPEC 03).
- **EDGE CASES:**
  - Un nombre vacío o con solo espacios: 400.
  - "Área Técnica" y luego "area  tecnica" en Áreas: 409. "Área Técnica" en Edificios: se permite.
  - Un nombre igual al de un ítem eliminado: se permite.
  - Una edición sin cambios efectivos (mismo nombre, o mismo `activo`) responde 200 y no escribe ni audita.
  - Renombrar cambiando solo mayúsculas o acentos ("Area" → "Área"): se permite, porque el único que colisiona es el propio ítem.
  - Editar, mover, activar o eliminar un ítem inexistente o ya eliminado: 404.
- **MUST NOT:**
  - Una tabla genérica de catálogos con discriminador, o un modelo EAV.
  - Borrar físicamente un ítem.
  - Aceptar `orden`, `nombreNormalizado`, `clave`, `createdBy` o `updatedBy` desde el cliente.
  - Que un agente mute un catálogo o lea su historial.

**Feature 4.2: Orden con flechas**

- **MUST:**
  - `move({ itemId, direccion })` intercambia el `orden` del ítem con el de su vecino inmediato (el anterior para `subir`, el siguiente para `bajar`). El vecino se busca entre los no eliminados del mismo catálogo, activos e inactivos, en el orden de `list`.
  - El intercambio y sus dos `AuditLog` (un `update` por ítem, con solo `orden` en el diff) van en una sola transacción.
- **EDGE CASES:**
  - Subir el primero o bajar el último: 200, sin cambios ni auditoría (la UI además deshabilita esa flecha).
  - Con dos ítems de igual `orden` (solo posible si alguien edita la base a mano), el `move` reasigna `orden` 1..N a todo el catálogo en el orden de `list` antes de intercambiar. Audita solo los ítems cuyo `orden` cambió.
- **MUST NOT:** un campo `orden` editable en los formularios, ni arrastrar y soltar.

**Feature 4.3: Proveedores**

- **MUST:**
  - Además de la base, tiene `contacto`, `telefono`, `correo` y `sitioWeb`, todos opcionales (P10, Q16).
  - `correo`, si viene, debe ser un email válido.
  - `sitioWeb`, si viene, debe ser una URL con esquema `http://` o `https://` (Q16).
  - `telefono` es texto libre recortado, de hasta 50 caracteres: acepta código de país, guiones y extensiones (Q16).
  - Un campo opcional en blanco, una vez recortado, se guarda como `null`. Editar y dejar un campo en blanco lo borra.
- **EDGE CASES:**
  - `www.proveedor.com` (sin esquema) y `ftp://proveedor.com`: 400.
  - `soporte@` como correo: 400.
- **MUST NOT:** guardar en el catálogo números de ticket del proveedor (P1: `referenciaExterna` vive en `Ticket`, SPEC 05).

**Feature 4.4: Estados y Prioridades**

- **MUST:**
  - `EstadoTicket` es un catálogo en la base, no un enum en código (P2). No tiene casilla `cerrado` ni `inicial`.
  - Los cuatro estados de sistema llevan una `clave` fija que el admin no ve ni edita (D1):

    | Estado | `clave` |
    |---|---|
    | Finalizado | `FINALIZADO` |
    | Cerrado | `CERRADO` |
    | Cancelado | `CANCELADO` |
    | Reabierto | `REABIERTO` |

    El resto de los estados tiene `clave: null`.
  - Un estado con `clave` se puede renombrar, mover, desactivar y reactivar, pero **nunca eliminar**: 409, esté o no en uso (D1).
  - En `EstadoTicket` y en `Prioridad` siempre queda al menos un ítem activo. Desactivar o eliminar el último activo se rechaza con 409 (Q18; en Prioridad, decisión del usuario del 2026-10-05, porque SPEC 05 la exige en el alta). Los otros 5 catálogos no tienen esta regla.
  - El ticket nace en el primer estado activo según el orden de `list` (Q17). Eso lo implementa SPEC 05; este spec solo garantiza que siempre existe uno.
- **EDGE CASES:**
  - Desactivar el primer estado del orden: los tickets nuevos nacen en el siguiente activo (Q18).
  - Renombrar "Finalizado" a "Resuelto" no cambia su `clave` ni ninguna regla (D1).
  - Eliminar un ítem inactivo cuando queda un solo activo: se permite, porque el activo sigue estando.
- **MUST NOT:** comparar contra el `nombre` de un estado en ningún módulo (`if (nombre === "Finalizado")`); siempre se compara contra `clave`. Tampoco exponer `clave` en una entrada.

**Feature 4.5: Seed**

- **MUST:**
  - `pnpm --filter @syc/api seed` (`apps/api/src/seed.ts`) carga, después del admin y los departamentos, cada catálogo **solo si su tabla no tiene ninguna fila**:
    - Estados, con `orden` 1 a 7: Pendiente, En progreso, En espera, Finalizado (`FINALIZADO`), Cerrado (`CERRADO`), Cancelado (`CANCELADO`), Reabierto (`REABIERTO`).
    - Prioridades, con `orden` 1 a 4: Baja, Media, Alta, Urgente.
  - Las filas del seed tienen `createdBy` = `updatedBy` = id del admin raíz, que el seed asegura en el paso anterior. Su `AuditLog` es `create` con `actorId: null` (SPEC 03: null = sistema).
  - El seed escribe a través de `CatalogsRepository`: ningún archivo fuera de un repository importa `@syc/db`.
- **EDGE CASES:** correrlo otra vez no crea nada ni deja registros. Tampoco deshace un renombre: si el admin cambió "Pendiente" por "Nuevo", el seed no vuelve a crear "Pendiente".
- **MUST NOT:** cargar Áreas, Edificios, Tipos, Módulos ni Proveedores; correr al arrancar la API.

**Feature 4.6: Pantalla de administración**

- **MUST:**
  - El sidebar suma el link "Catálogos" (`/admin/catalogos`) bajo "Administración", solo para el admin.
  - `routes/_authenticated/admin/catalogos.tsx` muestra pestañas en este orden: Áreas, Edificios, Tipos, Prioridades, Módulos, Proveedores, Estados. La pestaña activa vive en el search param `?catalogo=<ruta>`, así que al recargar se mantiene.
  - Cada pestaña tiene un título, un botón "Nuevo/a …" y una tabla en el orden de `list`.
    - Columnas: Nombre y Estado (insignia Activo/Desactivado). Proveedores suma Contacto, Teléfono, Correo y Sitio web.
    - Acciones por fila: Subir, Bajar, Editar, Desactivar/Reactivar y Eliminar.
    - "Subir" está deshabilitado en la primera fila y "Bajar" en la última.
  - El formulario de alta y edición es un diálogo con react-hook-form y el esquema del contrato: solo "Nombre", o los 5 campos en Proveedores.
  - En Estados, las filas con `clave` muestran la insignia "De sistema" y no tienen el botón Eliminar.
  - Eliminar pide confirmación ("Se eliminará «X». No se puede deshacer desde la pantalla; si solo querés ocultarlo, desactivalo.").
  - Los errores de la API (409, 400) se muestran con `getErrorMessage`, como en Departamentos.
  - Hooks en `features/catalogs/hooks`:
    - `useCatalog(ruta)` devuelve todo `list`; lo usan la pantalla y los filtros de SPEC 06.
    - `useCatalogOptions(ruta)` devuelve solo los activos, en el mismo orden; lo usan los selectores de SPEC 05.
    - `useCatalogMutations(ruta)` agrupa las mutaciones, y cada una invalida la query de su catálogo.
- **MUST NOT:** que una ruta o un componente de layout llame al cliente oRPC directo; mostrar la `clave` como texto; una pantalla de historial.

## Plan de implementación

1. **Esquema.** Los 7 modelos y las relaciones inversas en `User` dentro de `schema.prisma`, más la migración `catalogos`. Al SQL generado se le agregan a mano los 7 índices únicos parciales, con un comentario. Verificar: `prisma migrate dev` aplica limpio. Un `migrate dev` siguiente, sin cambios, no genera migración ni propone borrar esos índices.
2. **Contrato.** `packages/contracts/src/catalogs.ts` con los esquemas, la función que arma los 7 procedimientos por catálogo y `contract.catalogs`, exportado desde `index.ts`. Verificar: `pnpm --filter @syc/contracts typecheck` pasa, y un test del contrato confirma que `blankToNull` convierte `"  "` en `null` y rechaza `www.x.com`.
3. **Módulo base.** `modules/catalogs`: `catalog-definitions.ts`, `catalogs.repository.ts` (`findAll`, `create`, `update`, `swapOrden`, `setActive`, `softDelete`, `seedIfEmpty`, cada mutación con `writeAuditEntry` en su `$transaction` y la violación del índice traducida a 409) y `catalogs.service.ts` (Features 4.1 a 4.3). Verificar con `catalogs.service.spec.ts`:
   - nombre duplicado normalizado → 409;
   - recrear tras eliminar → ok;
   - edición sin cambios → no audita;
   - `move` en un extremo → no audita;
   - `move` intercambia y deja dos `update`.
4. **Reglas de Estados y Prioridades.** `clave` no eliminable y "último activo" (Feature 4.4), declaradas en `catalog-definitions.ts` y aplicadas en el service. Verificar: tests de eliminar "Cerrado" → 409 y de desactivar la última prioridad activa → 409.
5. **Controllers.** `catalogs-read.controller.ts` (los 7 `list`, sin `@RequirePermission`) y `catalogs.controller.ts` (el resto, `@RequirePermission(PERMISSIONS.MANAGE)`, implementado completo), siguiendo el patrón de `users-me.controller.ts`. `CatalogsModule` se registra en `app.module.ts`. Verificar: `pnpm typecheck` pasa. Con Bruno (`bruno/catalogs/`), un agente recibe 403 al crear un área y 200 al listarla.
6. **Seed.** `seedCatalogs` en `apps/api/src/seed.ts` (Feature 4.5). Verificar: sobre una base vacía deja 7 estados y 4 prioridades con 11 `create` de `actorId` null. Una segunda corrida no agrega nada.
7. **Web, base.** `components/ui/tabs.tsx` (shadcn), `features/catalogs/hooks`, `catalog-kinds.ts` (etiquetas y textos por pestaña), `CatalogsAdmin.tsx`, `CatalogTable.tsx`, `CatalogItemFormDialog.tsx`, la ruta `admin/catalogos.tsx` y el link del sidebar. Verificar: en Áreas, el admin crea, edita, mueve, desactiva, reactiva y elimina un ítem. Un test de `useCatalogOptions` confirma que filtra los inactivos sin cambiar el orden.
8. **Web, casos propios.** `ProveedorFormDialog.tsx` con las columnas de Proveedores, y la insignia "De sistema" sin "Eliminar" en Estados. Verificar: un proveedor con correo inválido muestra el error. Las 4 filas de sistema no tienen Eliminar.
9. **Verificación y documentación.**
   - `scripts/verify/specs/04-catalogos.mjs`, agregado a `specs/index.mjs`.
   - `CLAUDE.md`: estado del repositorio y `pnpm verify` con SPEC 04.
   - `apps/api/CLAUDE.md`: módulo `catalogs`, índice parcial y seed de catálogos.
   - `docs/prd.md`: Prioridad con al menos una activa y las prioridades del seed.
   - `specs/05-tickets-nucleo.md`: suma el criterio "eliminar un ítem de catálogo en uso → 409".

   Verificar: `pnpm verify --spec 04` pasa.

## Criterios de aceptación

- [ ] En cada uno de los 7 catálogos, el admin crea, edita, sube, baja, desactiva, reactiva y elimina un ítem por la API. Cada paso deja un `AuditLog` con el `entityType` del catálogo, el admin como actor y el `payload` de la convención. Subir o bajar deja dos `update` con solo `orden`.
- [ ] Desde `/admin/catalogos`, el admin hace lo mismo en la pestaña Áreas sin deploy, y la pestaña elegida se mantiene al recargar.
- [ ] Crear "Área Técnica" y luego "area  tecnica" en Áreas devuelve 409. Crear "Área Técnica" en Edificios funciona.
- [ ] Eliminar un ítem y crear otro con el mismo nombre funciona. El eliminado ya no aparece en `list`.
- [ ] Editar, mover o eliminar un ítem ya eliminado devuelve 404. Una edición sin cambios no deja `AuditLog`.
- [ ] Subir el primer ítem o bajar el último no cambia ningún `orden` ni deja `AuditLog`.
- [ ] Eliminar Finalizado, Cerrado, Cancelado o Reabierto devuelve siempre 409. Renombrarlos o desactivarlos funciona y su `clave` no cambia.
- [ ] Desactivar o eliminar el único estado activo devuelve 409, y lo mismo con la única prioridad activa. En Áreas, desactivar el último activo funciona.
- [ ] Un proveedor con solo el nombre se guarda con los otros 4 campos en `null`. Un correo `soporte@` o un sitio `www.x.com` devuelve 400. Editarlo con un campo en blanco lo deja en `null`.
- [ ] Un agente recibe 403 en `create`, `update`, `move`, `setActive`, `remove` y `history` de cualquier catálogo. Su `list` responde 200 con los inactivos (`activo: false`) y sin los eliminados.
- [ ] `history` de un ítem devuelve al admin sus registros del más reciente al más antiguo. Un id sin registros devuelve `[]`.
- [ ] El seed sobre una base vacía deja los 7 estados en orden (4 con su `clave`) y Baja, Media, Alta y Urgente, con 11 `create` de `actorId` null. Correrlo otra vez, después de renombrar "Pendiente", no crea nada ni deshace el renombre.
- [ ] En la pestaña Estados, las 4 filas de sistema muestran "De sistema" y no tienen el botón Eliminar. El link "Catálogos" no aparece para un agente.
- [ ] `pnpm verify --spec 04` y `pnpm turbo lint typecheck test build` terminan con código 0.

El criterio "eliminar un ítem usado por un ticket no eliminado → 409" pasa a SPEC 05, porque antes no existen tickets.

## Decisiones

- **Sí:** un único módulo `catalogs` con service y repository genéricos, y un registro por catálogo en `catalog-definitions.ts`. Así se evita copiar siete veces el mismo ABM. Cada catálogo sigue siendo su propio modelo Prisma (regla 2 de `docs/architecture.md`).
- **No:** una tabla de catálogos con discriminador de tipo, ni EAV.
- **Sí:** `clave` interna fija para los 4 estados de sistema, en vez de comparar por nombre (D1). Los estados con clave no se eliminan.
- **Sí:** catálogos globales, ninguno por departamento (Q15).
- **Sí:** nombre único normalizado por catálogo (Q14), con `normalizeName` de `src/common/text.ts`, el mismo de departamentos.
- **Sí:** columna `nombreNormalizado` con índice único parcial (`WHERE "deletedAt" IS NULL`), además del chequeo del service. Departamentos solo tiene el chequeo del service; acá el índice evita duplicados por carrera.
- **Sí:** reordenar con flechas Subir/Bajar que intercambian con el vecino (decisión del usuario, 2026-10-05).
  - `orden` deja de ser un campo del formulario.
  - Descartado: un campo numérico, porque obliga a pensar números.
  - Descartado: arrastrar y soltar, porque suma una dependencia y es más difícil de probar.
- **Sí:** `move` deja un `update` por cada ítem cuyo `orden` cambió, en la misma transacción. Es la excepción a "una operación = un registro" de SPEC 03, porque toca dos entidades y el historial de cada una debe mostrar su cambio.
- **Sí:** un link "Catálogos" con pestañas, en vez de 7 links en el menú (decisión del usuario, 2026-10-05).
- **Sí:** el seed carga 7 estados y 4 prioridades (Baja, Media, Alta, Urgente), cada catálogo solo si su tabla está vacía (decisión del usuario, 2026-10-05). Sin prioridades no se puede crear un ticket (SPEC 05). "Solo si está vacía" evita que el seed recree un nombre que el admin cambió.
- **Sí:** Prioridad conserva siempre al menos un ítem activo, igual que Estados (decisión del usuario, 2026-10-05). Requiere actualizar `docs/prd.md`.
- **Sí:** `createdBy` de las filas del seed = admin raíz, porque la columna es FK obligatoria. El `AuditLog` mantiene `actorId: null` (sistema), como fija SPEC 03. Descartado: `createdBy` nullable solo para el seed.
- **Sí:** `list` devuelve activos e inactivos a cualquier usuario con sesión, y `useCatalogOptions` filtra en el cliente. SPEC 06 necesita filtrar por ítems inactivos.
- **Sí:** historial por catálogo en la API, solo admin y sin UI (decisión del usuario, 2026-10-05; Q11).
- **Sí:** los estados de sistema muestran la insignia "De sistema" y no tienen botón Eliminar (decisión del usuario, 2026-10-05). La API igual lo rechaza.
- **Sí:** `update` reemplaza todos los campos editables (nombre y, en Proveedor, los 4 opcionales), en vez de un PATCH parcial. Así un campo en blanco borra el dato sin ambigüedad.
- **No:** el chequeo "ítem en uso" en este spec. Sin tickets no hay contra qué contar; lo agrega SPEC 05 en `CatalogsService.remove`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Prisma no conoce los índices parciales escritos a mano y un `migrate dev` futuro podría proponer borrarlos. | El paso 1 verifica que un `migrate dev` sin cambios no genera nada. Si en el futuro aparece un `DROP INDEX`, se quita de esa migración. El comentario en el SQL lo explica. Si Prisma 7.10 soporta índices parciales sin preview, se usan y desaparece el riesgo. |
| `User` acumula 14 relaciones inversas (creador y editor por catálogo), y SPEC 05 y 06 suman más. | Son relaciones con nombre explícito y sin columnas nuevas; es el costo de tener FK reales (SPEC 03, Feature 3.3). |
| El service genérico tipa mal la diferencia entre catálogos (por ejemplo, acepta campos de Proveedor en Áreas). | Cada catálogo valida con su propio esquema Zod en el contrato. El repository recibe solo los campos de la definición, y los tests cubren Proveedor y Estados por separado. |
| Un estado con `clave` se puede borrar a mano en la base, por fuera de la API. | Es un riesgo operativo, fuera del código. Lo cubre el backup de SPEC 07. |
| Dos admins mueven ítems a la vez y quedan dos con el mismo `orden`. | El `move` detecta el empate y renumera el catálogo antes de intercambiar (Feature 4.2). |

## Qué **no** está en este spec

- Tickets, sus formularios y el rechazo por "ítem en uso" (SPEC 05).
- Filtros de la bandeja (SPEC 06).
- UI de historial y pantalla de auditoría global (Q11).
- Restaurar o listar eliminados (Q12).
- Arrastrar y soltar, y un campo `orden` editable.
- Datos iniciales de Áreas, Edificios, Tipos, Módulos y Proveedores.
- Campos personalizados sin deploy (Fase 2).
