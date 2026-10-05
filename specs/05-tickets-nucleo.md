# SPEC 05 — Tickets núcleo

> **Status:** Draft
> **Depends on:** SPEC 04 (catálogos)
> **Date:** 2026-09-29
> **Objective:** ciclo completo de un ticket — creación, numeración interna, edición colaborativa, cambio de estado, cierre, proveedor/referencia externa, historial y eliminación — con los permisos por departamento resueltos en guards.

## Por qué existe este spec

Es el primer módulo de negocio real del sistema (PRD §1) y la etapa 4 del PRD §10. Depende de SPEC 02 (departamento y permisos), SPEC 03 (auditoría y soft delete) y SPEC 04 (catálogos y la `clave` de `EstadoTicket`) porque un ticket referencia las tres cosas. Las respuestas Q19 a Q31 fijan cada regla que el PRD dejaba abierta.

## Alcance

**Dentro:**

- Modelo Prisma `Ticket`.
- Módulo `tickets` en `apps/api/src/modules/tickets`: router oRPC, service, repository.
- Numeración interna atómica (`TE-000013`).
- Creación, edición, cambio de estado, eliminación lógica.
- Historial del ticket (lee `AuditLog` de SPEC 03).
- Formulario de alta y edición en `apps/web` (`features/tickets`), sin bandeja ni comentarios todavía.

**Fuera de alcance (para specs futuros):**

- Comentarios del ticket y bandeja con filtros/búsqueda (SPEC 06).
- Adjuntos, exportar CSV, campos personalizados, asignación a individuos (Fase 2).

## Modelo de datos

```prisma
// packages/db/schema.prisma (fragmento)
model Ticket {
  id                  String    @id @default(cuid())
  numero              Int       @unique // se muestra formateado como TE-000013

  departamentoId      String    // FK a Organization (Better Auth)
  areaId              String?
  edificioId          String?
  tipoId              String?
  prioridadId         String
  moduloId            String?
  estadoId            String

  titulo              String
  descripcion         String?
  actuacionSimple     String?

  proveedorId         String?
  referenciaExterna   String?   // "Número/año", único por proveedor entre los no eliminados

  fechaRecepcion      DateTime  // fecha sin hora
  fechaCierre         DateTime? // fecha sin hora
  fechaReabierto       DateTime? // fecha sin hora

  solucionDescripcion String?
  notificado          Boolean   @default(false)

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  createdBy String
  updatedBy String
  deletedAt DateTime?

  @@index([departamentoId])
  @@index([estadoId])
}

model TicketSequence {
  id     Int @id @default(1)
  lastValue Int @default(0)
}
```

Nota: `createdBy` y `updatedBy` son FK reales a `User` (SPEC 03 Feature 3.3), no `String` sueltos; el fragmento de arriba los muestra simplificados.

Nota: `TicketSequence` es una fila única con lock (`SELECT ... FOR UPDATE`) o, alternativamente, una secuencia nativa de Postgres (`CREATE SEQUENCE`); la elección exacta se resuelve en el paso de implementación, ambas cumplen "atómica, sin repetición, con huecos tolerados" (Q21).

```ts
// packages/contracts/src/tickets.ts (fragmento)
export const createTicketInputSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  descripcion: z.string().trim().max(5000).optional(),
  prioridadId: z.string(),
  fechaRecepcion: z.string().date(), // YYYY-MM-DD, no futura
  departamentoId: z.string().optional(), // solo el admin puede enviarlo; el agente usa el suyo
  actuacionSimple: z.string().trim().max(500).optional(),
  proveedorId: z.string().optional(),
  referenciaExterna: z.string().regex(/^\d+\/\d{4}$/).optional(), // exige proveedorId si viene
});

export const updateTicketInputSchema = z.object({
  id: z.string(),
  updatedAt: z.string().datetime(), // para el bloqueo optimista, ver Feature 5.3
  titulo: z.string().trim().min(1).max(200).optional(),
  descripcion: z.string().trim().max(5000).optional(),
  areaId: z.string().optional(),
  edificioId: z.string().optional(),
  tipoId: z.string().optional(),
  moduloId: z.string().optional(),
  prioridadId: z.string().optional(),
  actuacionSimple: z.string().trim().max(500).optional(),
  proveedorId: z.string().nullable().optional(), // null = quitar proveedor
  referenciaExterna: z.string().regex(/^\d+\/\d{4}$/).nullable().optional(),
  notificado: z.boolean().optional(),
  departamentoId: z.string().optional(), // solo admin
});

export const changeTicketStatusInputSchema = z.object({
  id: z.string(),
  updatedAt: z.string().datetime(),
  estadoId: z.string(),
  fechaCierre: z.string().date().optional(),    // obligatoria si el estado destino tiene clave de cierre
  fechaReabierto: z.string().date().optional(),  // obligatoria si el estado destino tiene clave REABIERTO
  solucionDescripcion: z.string().trim().max(5000).optional(),
});
```

Convenciones:

- `numero` se guarda como entero; se formatea como `TE-` + el número con relleno de ceros a 6 dígitos mientras sea ≤ 999999, y sin relleno adicional a partir de `TE-1000000` (Q21, P9, P12).
- `referenciaExterna` se normaliza antes de guardar: se quitan los ceros a la izquierda del número (`019092/2026` → `19092/2026`); un número que queda en `0` se rechaza (Q29).
- Los tres estados con `clave` de cierre son `FINALIZADO`, `CERRADO` y `CANCELADO` (SPEC 04, D1). "clave de cierre" en este documento significa "una de esas tres".

## Contrato

**Feature 5.1: Creación**

- **MUST:**
  - Un agente crea el ticket solo en su propio departamento; el backend lo fuerza, ignorando cualquier `departamentoId` que mande en el payload. El admin puede elegir cualquier departamento activo (PRD §4.2, P7, SPEC 02 Feature 2.5).
  - Campos obligatorios: `titulo` (hasta 200, recortado, no vacío tras el trim), `departamento` (implícito para el agente), `prioridadId`, `fechaRecepcion` (Q19).
  - `descripcion` es opcional, hasta 5000 caracteres (Q19).
  - `actuacionSimple` y `proveedor` (con su `referenciaExterna`) son opcionales (P5, Q19).
  - `area`, `edificio`, `tipo` y `modulo` **no** se piden en el alta; quedan sin asignar (`null`) hasta que se completen en una edición posterior (Q19).
  - `estado`, `numero`, `fechaCierre`, `fechaReabierto`, `solucionDescripcion` y `notificado` no se piden en el alta: los genera o inicializa el servidor (Q19, Feature 5.2, 5.4).
  - `fechaRecepcion` es una fecha sin hora; el formulario propone el día de hoy y se puede cambiar; se acepta hoy o una fecha anterior, una fecha futura se rechaza (Q20).
  - Las relaciones que sí se cargan (`prioridadId`, `proveedorId` si viene) deben apuntar a ítems de catálogo activos.
  - El ticket nace en el primer estado activo según `orden` de `EstadoTicket` (SPEC 04 Feature 4.3, Q17).
  - `createdBy` sale de la sesión, nunca del payload. La creación queda auditada (SPEC 03).
  - El formulario de alta usa el mismo Zod de `packages/contracts` con react-hook-form (ARCH).
- **EDGE CASES:**
  - `prioridadId` o `proveedorId` inexistente, inactivo o eliminado: 400.
  - `referenciaExterna` sin `proveedorId`: 400 (Q29, ver Feature 5.5).
  - Un agente manda `departamentoId` en el payload: se ignora silenciosamente y se usa el suyo, o se rechaza con 400 — se define en implementación; en cualquier caso nunca se respeta el valor enviado *(propuesta técnica)*.
- **MUST NOT:** deducir el departamento del creador cuando carga el admin (PRD §4.1); pedir área, edificio, tipo, módulo o estado en el alta; adjuntos, campos personalizados o asignación a individuos (Fase 2).

**Feature 5.2: Numeración interna**

- **MUST:**
  - Formato `TE-000013`: prefijo fijo `TE` para todos los tickets, una única secuencia continua, sin año (P9, P12).
  - La genera el servidor de forma atómica (secuencia de Postgres o fila con lock), es inmutable y única; un ticket eliminado conserva su número, que nunca se reutiliza (P12, Q21).
  - Se toleran huecos si una creación falla después de tomar el número (Q21).
  - A partir de `TE-1000000` el número deja de rellenarse a 6 dígitos; hasta `TE-999999` se muestra siempre con 6 dígitos (Q21).
- **EDGE CASES:** dos creaciones concurrentes nunca producen el mismo número, garantizado por la secuencia atómica de Postgres, no por lógica de aplicación.
- **MUST NOT:** numerar por departamento, año o proveedor; que el prefijo codifique algo (P12); que el usuario edite el número.

**Feature 5.3: Edición colaborativa**

- **MUST:**
  - Editan el admin y los agentes del departamento del ticket, incluso con el ticket en un estado de cierre (Q23).
  - Bloqueo optimista: el cliente manda el `updatedAt` que tenía al abrir el formulario; si no coincide con el actual en la base, el servidor responde 409 y no guarda nada. Aplica tanto a editar campos como a cambiar el estado (Q22).
  - Cada edición actualiza `updatedAt`/`updatedBy` y queda auditada (SPEC 03).
  - Solo el admin puede cambiar el `departamentoId` de un ticket existente; el departamento nuevo debe estar activo. El número, los comentarios (SPEC 06) y el historial se conservan; a partir del cambio, editan los agentes del departamento nuevo (Q24).
- **EDGE CASES:**
  - `updatedAt` desactualizado: 409, la pantalla pide recargar.
  - Un agente intenta mandar `departamentoId`: 403.
- **MUST NOT:** editar `numero`, `createdAt` ni `createdBy`.

**Feature 5.4: Cambio de estado y cierre**

- **MUST:**
  - Se puede pasar de cualquier estado activo a cualquier otro estado activo; no hay una máquina de transiciones restringida (Q25).
  - Pasar a un estado con `clave` de cierre (`FINALIZADO`, `CERRADO` o `CANCELADO`) exige `fechaCierre` en esa misma request; `solucionDescripcion` es opcional (Q17, Q25, corrige la exigencia original de PRD §6.2).
  - Pasar a un estado con `clave: "REABIERTO"` exige `fechaReabierto` en esa misma request. `fechaCierre` y `solucionDescripcion` ya cargadas se conservan (Q25).
  - `fechaCierre` y `fechaReabierto` son fechas sin hora, no se completan solas: las carga quien cambia el estado, el formulario propone hoy y se puede cambiar; se acepta hoy o una fecha anterior, una fecha futura se rechaza (Q26).
  - Al pasar de un estado con `clave` de cierre a otro estado con `clave` de cierre, `fechaCierre` se conserva y quien guarda puede cambiarla en la misma request; no se recalcula sola (Q25, Q26).
  - En cambios de estado que no son hacia un estado con `clave` de cierre ni `REABIERTO`, ni `fechaCierre` ni `fechaReabierto` se piden ni se modifican (Q26).
  - `notificado` es una casilla manual, informativa, no obligatoria para ningún cambio de estado. Nace en `false` y se puede marcar o desmarcar en cualquier momento, incluso con el ticket cerrado. No dispara ningún aviso (Q27).
  - Asociar o cambiar un proveedor no cambia el estado del ticket por sí solo; el paso a "En espera" (o cualquier otro) lo hace el agente o el admin a mano, en una acción separada (Q28, reinterpreta PRD §6.4 paso 4).
  - Cada cambio de estado queda auditado con estado anterior, estado nuevo, usuario y fecha (SPEC 03).
- **EDGE CASES:**
  - Pasar a un estado con `clave` de cierre sin `fechaCierre`: 400, el estado no cambia.
  - Pasar a un estado con `clave: "REABIERTO"` sin `fechaReabierto`: 400, el estado no cambia.
  - `fechaCierre` o `fechaReabierto` futura: 400.
- **MUST NOT:** una casilla `cerrado` en el ticket o en el estado; exigir `solucionDescripcion` para cerrar; lógica que compare `nombre` del estado en vez de `clave`; notificaciones por correo (descartadas).

**Feature 5.5: Proveedor y referencia externa**

- **MUST:**
  - `proveedor` es opcional en todo momento.
  - `referenciaExterna` exige `proveedorId` cargado en la misma request; no puede existir sin proveedor (Q29).
  - Formato `número/año`: el número solo tiene dígitos, el año tiene 4 dígitos entre 2000 y 2100 (Q29).
  - Se normalizan los ceros a la izquierda del número antes de guardar (`019092/2026` → `19092/2026`); si el número normalizado queda en `0` (por ejemplo `000/2026`), se rechaza (Q29).
  - `referenciaExterna` vacía se permite, con o sin proveedor (Q29).
  - Es única por proveedor entre los tickets no eliminados (P11); se implementa con índice único parcial `(proveedorId, referenciaExterna) WHERE deletedAt IS NULL AND referenciaExterna IS NOT NULL` *(propuesta técnica)*.
  - Al quitar el proveedor de un ticket, `referenciaExterna` se borra en la misma operación. Al cambiar de proveedor, la referencia anterior no se conserva: en ese guardado se carga la del proveedor nuevo o queda vacía (Q30). El historial conserva el valor anterior (SPEC 03).
- **EDGE CASES:**
  - Duplicado con el mismo proveedor: 409, con un mensaje que nombra el ticket existente *(propuesta técnica)*.
  - El mismo número de referencia con otro proveedor: permitido.
  - Eliminar el ticket libera la referencia para ese proveedor (SPEC 03 Feature 3.4, soft delete no cuenta para la unicidad).
- **MUST NOT:** guardar la referencia externa en el catálogo de Proveedores (P1); aceptar `referenciaExterna` sin `proveedorId`.

**Feature 5.6: Historial del ticket**

- **MUST:** se lee desde `AuditLog` con `entityType = "Ticket"` (SPEC 03 Feature 3.2), mostrando usuario y fecha de cada cambio, incluidos los cambios de estado (PRD §10, etapa 4).
- **EDGE CASES:** visibilidad igual que el ticket mismo — un agente de otro departamento no lo ve porque tampoco ve el ticket (SPEC 02 Feature 2.5).
- **MUST NOT:** una tabla de historial propia de `Ticket` que duplique `AuditLog`.

**Feature 5.7: Eliminación de ticket**

- **MUST:**
  - Solo el admin puede eliminar un ticket; un agente recibe 403, incluso si el ticket es de su propio departamento (Q31, completa la matriz PRD §4.2, que no incluía esta acción).
  - Eliminación lógica (SPEC 03 Feature 3.4): sale de cualquier listado, el número no se reutiliza (Feature 5.2) y la `referenciaExterna` queda libre para ese proveedor (Feature 5.5).
  - Queda auditada con `action: "delete"`.
- **MUST NOT:** `DELETE` físico.

## Plan de implementación

1. Modelo `Ticket` (+ `TicketSequence` o `CREATE SEQUENCE`) y migración, con el índice único parcial de `referenciaExterna`. Verificar: `prisma migrate dev` aplica limpio.
2. `packages/contracts/src/tickets.ts` con los esquemas de creación, edición y cambio de estado. Verificar: `pnpm --filter @syc/contracts typecheck` pasa.
3. `tickets.repository.ts`: generación atómica de `numero`, aplicación del helper de soft delete y de auditoría de SPEC 03. Verificar: test de concurrencia (dos creaciones en paralelo) produce números distintos.
4. `tickets.service.ts`: reglas de Feature 5.1 (departamento forzado para agente), Feature 5.4 (`clave` de cierre/reapertura) y Feature 5.5 (normalización y unicidad de `referenciaExterna`). Verificar: crear con `referenciaExterna` sin proveedor devuelve 400; pasar a un estado `FINALIZADO` sin `fechaCierre` devuelve 400.
5. `tickets.controller.ts` (router oRPC) detrás de `PermissionsGuard` con la regla "agente solo su departamento" de SPEC 02 Feature 2.5, más `@RequirePermission("admin")` en eliminar y en cambiar `departamentoId`. Verificar: un agente que intenta eliminar un ticket de su propio departamento recibe 403.
6. Bloqueo optimista: comparar `updatedAt` recibido contra el actual antes de cualquier `update`. Verificar: dos ediciones simultáneas sobre el mismo ticket, la segunda responde 409.
7. `apps/web`: `features/tickets/hooks` (`useCreateTicket`, `useUpdateTicket`, `useChangeTicketStatus`) + formulario de alta (`routes/_authenticated/tickets/new`) y de edición (`routes/_authenticated/tickets/$id`, sin bandeja todavía — placeholder de lista). Verificar: el formulario de alta no muestra campos de estado, área, edificio, tipo ni módulo.
8. Tests Vitest: `tickets.service.spec.ts` cubriendo Feature 5.1, 5.2 (concurrencia simulada), 5.4 y 5.5, con el repository mockeado. Verificar: `pnpm --filter @syc/api test` pasa.

## Criterios de aceptación

- [ ] Un agente crea un ticket sin poder elegir departamento; el ticket queda en el suyo.
- [ ] El admin crea un ticket en cualquier departamento activo.
- [ ] Dos tickets creados en paralelo (test de concurrencia) reciben números distintos y consecutivos o con huecos, nunca repetidos.
- [ ] Un ticket nace en el primer estado activo por `orden`, sin que el alta lo pregunte.
- [ ] Pasar un ticket a "Finalizado" sin `fechaCierre` devuelve 400; con `fechaCierre` y sin `solucionDescripcion` funciona.
- [ ] Pasar un ticket a "Reabierto" exige `fechaReabierto` y conserva `fechaCierre` y `solucionDescripcion` anteriores.
- [ ] Cargar `referenciaExterna` sin `proveedorId` devuelve 400; `019092/2026` se guarda como `19092/2026`.
- [ ] Dos tickets con el mismo proveedor y la misma `referenciaExterna` (no eliminados): el segundo devuelve 409.
- [ ] Dos ediciones simultáneas sobre el mismo ticket: la segunda devuelve 409 por `updatedAt` desactualizado.
- [ ] Un agente que intenta eliminar un ticket, o cambiarle el departamento, recibe 403 en ambos casos.
- [ ] Un ticket eliminado no aparece en ningún listado, pero su historial sigue existiendo en `AuditLog`.
- [ ] Un ticket cuyo ítem de catálogo se elimina después sigue mostrando ese valor en su detalle e historial (SPEC 03 Feature 3.4).
- [ ] Eliminar un ítem de catálogo (área, edificio, tipo, prioridad, módulo, proveedor o estado) que usa un ticket no eliminado devuelve 409; sigue funcionando para un ítem que ningún ticket usa. El chequeo vive en `CatalogsService.remove` (SPEC 04).
- [ ] `pnpm turbo lint typecheck test build` termina con código 0.

## Decisiones

- **Sí:** reemplazar la casilla `cerrado` por la `clave` interna de SPEC 04 (D1); las reglas de este spec comparan `clave`, nunca `nombre` ni una casilla. Requiere actualizar `docs/prd.md` §6.1 y §6.2.
- **Sí:** `solucionDescripcion` opcional, contra el texto original de PRD §6.2 ("exige `solucionDescripcion`"). Decisión explícita del usuario (Q17, Q25); requiere actualizar el PRD.
- **Sí:** `fechaReabierto` como campo nuevo, no previsto en el PRD original (PRD §6.1 no lo lista). Sigue el mismo patrón que `fechaCierre`.
- **Sí:** área, edificio, tipo y módulo quedan fuera del alta y se completan después, en vez de ser obligatorios como sugiere PRD §6.4 paso 3. Decisión explícita del usuario (Q19); requiere actualizar el PRD.
- **Sí:** solo el admin elimina tickets (Q31), llenando un vacío de la matriz PRD §4.2.
- **No:** máquina de estados con transiciones restringidas. Se decidió transición libre entre estados activos (Q25).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La generación atómica del número puede ser un cuello de botella si el volumen de creación crece mucho. | Fuera de alcance para el volumen esperado de este sistema interno; si se vuelve un problema, se revisa en una decisión nueva. |
| El bloqueo optimista por `updatedAt` puede frustrar a un agente si guarda justo después de otro. | La pantalla debe mostrar un mensaje claro ("otro usuario editó este ticket, recargá para ver los cambios") en vez de un error genérico — detalle de implementación en `apps/web`. |
| Cambiar `solucionDescripcion` de obligatoria a opcional y quitar la casilla `cerrado` contradice el texto actual del PRD. | Actualizar `docs/prd.md` §6.1, §6.2 y §11.1 en el mismo cambio que este spec, para que no quede una fuente de verdad desactualizada. |

## Qué **no** está en este spec

- Comentarios y bandeja con filtros/búsqueda (SPEC 06).
- Adjuntos, exportar CSV, campos personalizados, asignación a individuos (Fase 2).
- La pantalla de lista/bandeja de tickets (aparece recién en SPEC 06); este spec solo cubre alta, edición y detalle mínimo.
