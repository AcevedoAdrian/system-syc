# SPEC 10 — Número de factura del ticket

> **Status:** Implemented
> **Depends on:** SPEC 03 (auditoría y eliminación lógica), SPEC 04 (catálogos), SPEC 05 (tickets núcleo)
> **Date:** 2026-10-26
> **Objective:** sumar al ticket un campo opcional `numeroFactura`, ligado al proveedor, que se carga en el alta y la edición junto a la referencia externa.

## Por qué existe este spec

Cuando interviene un proveedor, el trabajo termina facturado, y hoy el número de esa factura no tiene dónde guardarse en el ticket. El campo vive en el ticket, igual que `referenciaExterna` (P1): el catálogo de Proveedores sigue guardando solo datos del proveedor.

Decisiones del usuario del 2026-10-26:

- La factura exige proveedor, pero no referencia externa.
- Es texto libre, de hasta 50 caracteres, sin validación de formato.
- Se puede repetir: varios tickets pueden llevar la misma factura.
- No aparece en la bandeja (ni columna, ni filtro, ni búsqueda).
- Se carga en el alta y en la edición, en la sección «Proveedor».
- Al cambiar o quitar el proveedor en la edición, la factura se vacía.
- El campo se llama `numeroFactura`, con la etiqueta «N.º de factura».
- Suma su archivo a `pnpm verify` y una fila al PRD.

## Alcance

**Dentro:**

- Columna `numeroFactura String?` en `Ticket` y la migración `numero_factura`.
- Contratos en `packages/contracts/src/tickets.ts`:
  - `numeroFactura` en `createTicketInputSchema`, `updateTicketInputSchema` y `ticketSchema`;
  - la regla "factura exige proveedor", con el mismo patrón que `referenciaRequiereProveedor`.
- `tickets` en la API:
  - `create` y `update` guardan `numeroFactura`;
  - `tickets.get` lo devuelve;
  - la foto auditable (`snapshotOf`) lo incluye, así que el historial muestra sus cambios.
- Web:
  - el campo «N.º de factura» en `CreateTicketForm` y `TicketForm`, en la sección «Proveedor», debajo de «Referencia externa»;
  - deshabilitado sin proveedor, con la misma pista que la referencia;
  - se vacía junto con la referencia cuando el formulario la vacía;
  - la etiqueta «N.º de factura» en `ticket-fields.ts` para el historial.
- `scripts/verify/specs/10-numero-factura.mjs`, registrado en `scripts/verify/specs/index.mjs`.
- PRD §6.1: fila `numeroFactura`.
- `CLAUDE.md` (raíz) y `packages/db/CLAUDE.md`: nombrar la migración y el campo.

**Fuera de alcance (para otros specs):**

- La factura en la bandeja: columna, filtro o búsqueda por texto.
- Validar el formato AFIP (`PPPP-NNNNNNNN`) o la letra del comprobante.
- Unicidad de la factura (por proveedor o global).
- Más de una factura por ticket.
- Datos de la factura además del número: fecha, importe, archivo adjunto.
- Un catálogo de facturas, o guardar facturas en el catálogo de Proveedores.

## Modelo de datos

`packages/db/schema.prisma`, en `model Ticket`, junto a `referenciaExterna`:

```prisma
referenciaExterna   String? // "número/año" ya normalizado; único por proveedor (índice parcial)
numeroFactura       String? // texto libre del proveedor; exige proveedor; puede repetirse
```

Migración `numero_factura`, generada por `prisma migrate dev`:

```sql
ALTER TABLE "ticket" ADD COLUMN "numeroFactura" TEXT;
```

Sin índice: no se busca ni se filtra por factura. Los tickets existentes quedan con `null`.

Contrato (`packages/contracts/src/tickets.ts`):

```ts
const numeroFacturaSchema = blankToNull(z.string().trim().max(50));

// En createTicketInputSchema y updateTicketInputSchema:
numeroFactura: numeroFacturaSchema,
// .refine(...) nuevo, path ["numeroFactura"], mensaje "El número de factura requiere un proveedor"

// En ticketSchema:
numeroFactura: z.string().nullable(),
```

`update` reemplaza todos los campos editables (SPEC 05): un `numeroFactura` ausente o en blanco se guarda como `null`.

## Contrato

### Feature 10.1 — Número de factura

- **MUST:**
  - `numeroFactura` es opcional siempre.
  - Exige `proveedorId` en la misma request: factura sin proveedor es 400, en `create` y en `update`.
  - No exige `referenciaExterna`.
  - Texto libre: se recortan los espacios de los extremos, y en blanco se guarda `null`.
  - Más de 50 caracteres: 400.
  - Puede repetirse en otros tickets, del mismo proveedor o de otro.
  - `tickets.get` lo devuelve.
  - La foto auditable lo guarda como texto: alta, edición y vaciado dejan su diff en el historial.
  - Los permisos son los de `tickets.create` y `tickets.update` (SPEC 05): sin regla propia.
- **EDGE CASES:**
  - Quitar el proveedor con factura cargada en la misma request: 400 (la web vacía el campo antes de enviar).
  - Cambiar de proveedor en la edición: el formulario vacía la factura; el historial conserva el valor anterior.
  - Editar un ticket cerrado: la factura se edita igual que los demás campos.
  - Una edición que solo cambia espacios de los extremos no tiene cambios efectivos: 200 sin escribir ni auditar.
- **MUST NOT:** validar formato; rechazar un número repetido; guardar la factura en el catálogo de Proveedores; mostrarla en `tickets.list`.

### Feature 10.2 — Web

- **MUST:**
  - Campo «N.º de factura» en la sección «Proveedor» del alta (`/tickets/nuevo`) y de la edición (`/tickets/$ticketId`), debajo de «Referencia externa».
  - Deshabilitado mientras no haya proveedor, con la pista «Elegí un proveedor para cargar la factura.».
  - En el alta, quitar el proveedor vacía la factura.
  - En la edición, cambiar o quitar el proveedor vacía la factura.
  - Un error del servidor sobre `numeroFactura` se muestra bajo el campo.
  - El historial muestra el cambio con la etiqueta «N.º de factura».
- **MUST NOT:** columna, filtro o búsqueda en la bandeja.

## Plan de implementación

1. **Esquema y migración.** `numeroFactura String?` en `Ticket`; `prisma migrate dev --name numero_factura`. Verificar: `prisma migrate deploy` sobre la base de desarrollo, y un segundo `migrate dev` no genera nada (en particular, no propone borrar los índices parciales escritos a mano).
2. **Contrato.** `numeroFacturaSchema`, el campo en los tres esquemas y la regla "exige proveedor". Verificar con `packages/contracts/test/tickets.test.ts`: en blanco → `null`; `"  0003-00004567  "` → `"0003-00004567"`; 51 caracteres → error; factura sin proveedor → error en `numeroFactura`; factura con proveedor y sin referencia → válido.
3. **API.** `tickets.repository.ts` (tipos de alta y edición, `select`, mapeo), `tickets.service.ts` (`create` y `update`) y `ticket-audit-snapshot.ts`. Verificar con `apps/api/test/tickets/tickets.service.test.ts`: el alta guarda la factura; la edición la cambia y deja diff; una edición sin cambios no audita; la misma factura en dos tickets del mismo proveedor se acepta.
4. **Web: alta.** El campo en `CreateTicketForm.tsx`, deshabilitado sin proveedor y vaciado al quitarlo. Verificar con `apps/web/test/tickets/components/CreateTicketForm.test.tsx` y los fixtures de `apps/web/test/fixtures/ticket-fixtures.ts`.
5. **Web: edición e historial.** El campo en `TicketForm.tsx`, vaciado al cambiar o quitar el proveedor, y la etiqueta en `ticket-fields.ts`. Verificar con `TicketForm.test.tsx` y `apps/web/test/tickets/ticket-fields.test.ts`.
6. **Verify.** `scripts/verify/specs/10-numero-factura.mjs` con `defineSpec`, reutilizando los fixtures de `scripts/verify/lib/`, y su registro en `scripts/verify/specs/index.mjs`. Verificar: `pnpm verify --spec 10` pasa.
7. **Documentación.** PRD §6.1 (fila `numeroFactura`), `packages/db/CLAUDE.md` (migración `numero_factura`) y `CLAUDE.md` de la raíz (estado del repositorio, SPEC 10 en la lista de `pnpm verify`). Verificar: `pnpm verify --spec 05,06,08,10` y `pnpm turbo lint typecheck test build` pasan.

## Criterios de aceptación

- [X] Después de `prisma migrate deploy`, la tabla `ticket` tiene la columna `numeroFactura` nullable, y los tickets existentes la tienen en `null`.
- [X] `tickets.create` con proveedor, sin referencia externa y con `numeroFactura: "0003-00004567"` devuelve 200, y `tickets.get` trae `numeroFactura: "0003-00004567"`.
- [X] `tickets.create` con `numeroFactura` y sin `proveedorId` devuelve 400.
- [X] `tickets.update` con `proveedorId: null` y `numeroFactura` cargado devuelve 400.
- [X] `numeroFactura` de 51 caracteres devuelve 400, en `create` y en `update`.
- [X] `numeroFactura: "   "` se guarda como `null`, y `"  A-12  "` como `"A-12"`.
- [X] Dos tickets del mismo proveedor con el mismo `numeroFactura` se guardan los dos (200).
- [X] Cambiar la factura de un ticket deja un `AuditLog` `update` cuyo diff tiene `numeroFactura` antes y después.
- [X] Una edición que solo agrega espacios en los extremos de la factura responde 200 y no deja `AuditLog`.
- [X] `tickets.list` no incluye `numeroFactura` en sus filas.
- [X] En la web, el campo «N.º de factura» está deshabilitado sin proveedor, en el alta y en la edición.
- [X] En la web, en la edición, cambiar el proveedor vacía el campo «N.º de factura».
- [X] En la web, el historial del ticket muestra el cambio con la etiqueta «N.º de factura».
- [X] La tabla §6.1 del PRD tiene la fila `numeroFactura`.
- [X] `pnpm verify --spec 05,06,08,10` y `pnpm turbo lint typecheck test build` terminan con código 0.

## Decisiones

- **Sí:** el campo vive en el ticket (decisión del usuario, 2026-10-26). Es un dato del trabajo, no del proveedor, como `referenciaExterna` (P1).
- **No:** un catálogo o una tabla de facturas. Un solo número por ticket no lo justifica.
- **Sí:** exige proveedor, pero no referencia externa (decisión del usuario, 2026-10-26). Hay proveedores que facturan sin dar número de ticket.
- **No:** exigir referencia externa. Dejaría sin lugar la factura de un proveedor que no asigna referencia.
- **Sí:** texto libre de hasta 50 caracteres (decisión del usuario, 2026-10-26). Cada proveedor factura con su formato, y algunos desde sistemas propios.
- **No:** validar el formato AFIP ni la letra. Rechazaría facturas reales con otra forma.
- **No:** normalizar ceros ni guiones. Sin formato fijo no hay forma canónica; solo se recortan los espacios.
- **Sí:** puede repetirse (decisión del usuario, 2026-10-26). Una factura suele cobrar varios trabajos.
- **No:** índice único. Por eso tampoco hay índice parcial escrito a mano ni traducción de `P2002`.
- **Sí:** al cambiar o quitar el proveedor en la edición, la web vacía la factura (decisión del usuario, 2026-10-26). La factura es de ese proveedor; es la misma regla que la referencia (Q30).
- **No:** que el servidor vacíe la factura solo al cambiar de proveedor. `update` reemplaza todos los campos y no infiere uno a partir de otro; la web manda el valor ya vacío, y quitar el proveedor con factura es 400.
- **Sí:** fuera de la bandeja (decisión del usuario, 2026-10-26). Solo se ve y se edita en el detalle del ticket.
- **Sí:** nombre `numeroFactura`, etiqueta «N.º de factura» (decisión del usuario, 2026-10-26).
- **Sí:** archivo propio de `pnpm verify` (decisión del usuario, 2026-10-26).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un `migrate dev` futuro propone borrar los índices parciales escritos a mano (catálogos y referencia externa). | El paso 1 verifica que la migración `numero_factura` solo tiene el `ADD COLUMN`, y que un segundo `migrate dev` no genera nada. |
| Los verify 05, 06 y 08 arman tickets con un cuerpo fijo y fallan si el contrato cambia. | `numeroFactura` se acepta ausente en `create` (es `blankToNull`), así que esos cuerpos siguen válidos. El paso 7 corre los cuatro verify juntos. |
| Sin validación de formato, el mismo comprobante se carga de dos maneras (`3-4567` y `0003-00004567`). | Aceptado: no se busca ni se filtra por factura. Si hace falta, la validación va en otro spec. |

## Qué **no** está en este spec

- La factura en la bandeja (columna, filtro o búsqueda).
- Validación de formato AFIP o de la letra del comprobante.
- Unicidad de la factura.
- Más de una factura por ticket.
- Fecha, importe o archivo de la factura.
- Facturas en el catálogo de Proveedores.

Cada uno, si hace falta, va en su propio spec.
