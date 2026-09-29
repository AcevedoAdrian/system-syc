# SPEC 04 — Catálogos

> **Status:** Draft
> **Depends on:** SPEC 03 (auditoría y eliminación lógica)
> **Date:** 2026-09-29
> **Objective:** ABM completo de Área, Edificio, TipoTicket, Prioridad, Modulo, Proveedor y EstadoTicket, administrables por el admin desde la UI sin deploy, listos para que SPEC 05 los consuma en el alta y edición de tickets.

## Por qué existe este spec

PRD §5.1 exige "catálogos administrables desde la pantalla" y §10 los marca como etapa 3, antes de tickets núcleo (etapa 4): un ticket no se puede cargar sin área, prioridad, etc. cargados primero. Las respuestas Q13 a Q18 fijan las reglas de unicidad, alcance y el reemplazo de la casilla `cerrado` por una clave interna (D1).

## Alcance

**Dentro:**

- Modelos Prisma: `Area`, `Edificio`, `TipoTicket`, `Prioridad`, `Modulo`, `Proveedor`, `EstadoTicket`.
- Un módulo por catálogo en `apps/api/src/modules/catalogs` (o un módulo `catalogs` con sub-routers, según convenga en la implementación), siguiendo la convención de SPEC 03 (campos de auditoría, eliminación lógica, `audit.log`).
- Pantallas de administración en `apps/web` (`routes/_authenticated/settings/`) para cada catálogo.
- Selectores reutilizables (`features/catalogs/hooks`) que los formularios de SPEC 05 van a consumir.

**Fuera de alcance (para specs futuros):**

- Tickets en sí y sus selectores completos armados (SPEC 05).
- Campos personalizados por admin sin deploy (Fase 2, nivel 2 de PRD §8.3).

## Modelo de datos

```prisma
// packages/db/schema.prisma (fragmento — Area, Edificio, TipoTicket, Prioridad y Modulo
// comparten esta forma; se repite un modelo por catálogo, no una tabla genérica)
model Area {
  id           String    @id @default(cuid())
  nombre       String
  nombreNormalizado String // trim + lowercase + sin acentos, para el índice único
  orden        Int       @default(0)
  activo       Boolean   @default(true)
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  createdBy    String
  updatedBy    String
  deletedAt    DateTime?

  @@unique([nombreNormalizado], name: "area_nombre_unico") // ver nota de índice parcial abajo
}

model Proveedor {
  id        String    @id @default(cuid())
  nombre    String
  nombreNormalizado String
  contacto  String?
  telefono  String?
  correo    String?
  sitioWeb  String?
  orden     Int       @default(0)
  activo    Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  createdBy String
  updatedBy String
  deletedAt DateTime?
}

model EstadoTicket {
  id        String    @id @default(cuid())
  nombre    String
  nombreNormalizado String
  clave     String?   // "FINALIZADO" | "CERRADO" | "CANCELADO" | "REABIERTO" | null — ver D1
  orden     Int       @default(0)
  activo    Boolean   @default(true)
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  createdBy String
  updatedBy String
  deletedAt DateTime?

  @@unique([clave], name: "estado_clave_unica") // solo aplica a filas con clave no nula
}
```

Nota de implementación: el `@@unique` de Prisma no soporta nativamente "único solo entre los no eliminados" — se implementa como índice único parcial en la migración SQL (`CREATE UNIQUE INDEX ... WHERE deleted_at IS NULL`), tal como ya prevé PRD §8.3 para `referenciaExterna`.

```ts
// packages/contracts/src/catalogs.ts (fragmento, repetido por catálogo)
export const areaInputSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  orden: z.number().int().default(0),
});

export const proveedorInputSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  contacto: z.string().trim().max(120).optional(),
  telefono: z.string().trim().max(50).optional(),
  correo: z.string().trim().email().optional(),
  sitioWeb: z.string().trim().url().refine((v) => v.startsWith("http://") || v.startsWith("https://")).optional(),
  orden: z.number().int().default(0),
});

// EstadoTicket no expone `clave` en el contrato de entrada: la asigna el seed,
// nunca el admin. El contrato de salida sí la incluye (de solo lectura) para
// que el frontend sepa qué estados no se pueden eliminar.
export const estadoTicketInputSchema = z.object({
  nombre: z.string().trim().min(1).max(120),
  orden: z.number().int().default(0),
});
```

## Contrato

**Feature 4.1: ABM de Área, Edificio, TipoTicket, Prioridad y Modulo**

- **MUST:**
  - Un modelo Prisma por catálogo, cada uno con `nombre`, `orden`, `activo` y los campos de auditoría base de SPEC 03 (PRD §8.3).
  - Todos los catálogos son globales: una sola lista de Módulos, una de Edificios, etc., válida para los 4 departamentos (Q15).
  - Solo el admin crea, edita, reordena, desactiva/reactiva y elimina (PRD §4.2). Cualquier usuario autenticado puede leer, porque los formularios de ticket de SPEC 05 lo necesitan *(propuesta técnica)*.
  - Hay pantallas de administración; los cambios no requieren deploy (PRD §10, etapa 3).
  - Los selectores del ticket muestran solo ítems activos, ordenados por `orden` (y por nombre en caso de empate).
  - El nombre es único dentro de cada catálogo (no entre catálogos distintos), comparado ya recortado, sin distinguir mayúsculas ni acentos (`nombreNormalizado`). Cuentan los ítems activos e inactivos; los eliminados lógicamente no ocupan el nombre, así que se puede recrear un nombre después de eliminarlo (Q14).
  - Desactivar (`activo = false`) oculta el ítem de los selectores nuevos; los tickets que ya lo eligieron lo siguen mostrando; se puede reactivar (Q13).
  - Eliminar (`deletedAt`) solo se permite si ningún ticket no eliminado usa ese ítem; si está en uso, se rechaza con 409 — sigue siendo eliminación lógica, así que el historial y los tickets que ya lo tenían lo siguen mostrando (Q13, SPEC 03 Feature 3.4).
- **EDGE CASES:**
  - Nombre vacío o solo espacios: se rechaza tras el `trim` *(propuesta técnica)*.
  - Empate de `orden`: desempata por nombre *(propuesta técnica)*.
  - Crear un ítem con el mismo nombre normalizado que uno activo o inactivo (no eliminado): 409.
  - Crear un ítem con el mismo nombre normalizado que uno ya eliminado: se permite.
- **MUST NOT:** una tabla genérica de catálogos con discriminador; modelo EAV; que un agente cree, edite, reordene, desactive o elimine un catálogo.

**Feature 4.2: Proveedores**

- **MUST:**
  - Campos: `nombre` (único, igual que Feature 4.1), `contacto`, `telefono`, `correo`, `sitioWeb`, más `orden` y `activo` (P10).
  - Solo `nombre` es obligatorio; `contacto`, `telefono`, `correo` y `sitioWeb` son opcionales (Q16).
  - Si se carga `correo`, se valida formato de email. Si se carga `sitioWeb`, se valida formato de URL con esquema `http://` o `https://` (Q16).
  - `telefono` es texto libre, ya recortado, hasta 50 caracteres: acepta números locales, código de país, guiones y extensiones, sin formato estricto (Q16).
  - El catálogo no guarda referencias externas de tickets (P1): `referenciaExterna` vive en `Ticket` (SPEC 05).
- **EDGE CASES:** un campo opcional en blanco, ya recortado, queda vacío (no se guarda como espacio).
- **MUST NOT:** guardar en el catálogo números de ticket del proveedor.

**Feature 4.3: Estados (`EstadoTicket`)**

- **MUST:**
  - Es un catálogo en la base de datos (P2), no un enum en código.
  - No hay casilla `cerrado` ni casilla `inicial`. En su lugar, los cuatro estados de sistema (Finalizado, Cerrado, Cancelado, Reabierto) llevan una `clave` interna fija (`"FINALIZADO"`, `"CERRADO"`, `"CANCELADO"`, `"REABIERTO"`) que el admin no ve ni edita; el resto de los estados tiene `clave: null` (decisión D1, reemplaza P8).
  - Los estados con `clave` no nula se pueden renombrar, reordenar y desactivar, pero **no se pueden eliminar** — SPEC 05 depende de su `clave`, no de su `id`, así que su presencia es estructural (D1).
  - El seed carga, en este orden: Pendiente, En progreso, En espera, Finalizado (`clave: "FINALIZADO"`), Cerrado (`clave: "CERRADO"`), Cancelado (`clave: "CANCELADO"`), Reabierto (`clave: "REABIERTO"`) (PRD §6.2, seed ampliado por decisión del usuario).
  - El ticket nace en el primer estado activo según `orden`; con el seed sin modificar, es Pendiente. El formulario de alta no pregunta el estado (Q17, SPEC 05 Feature 5.1).
  - Siempre hay al menos un estado activo: desactivar o eliminar el último estado activo se rechaza (Q18).
  - Nombre único por catálogo, igual regla que Feature 4.1 (Q14).
- **EDGE CASES:**
  - Desactivar un estado en uso: sigue la regla de Feature 4.1 (Q13) — sale del selector, los tickets que lo tenían lo siguen mostrando, se puede reactivar.
  - Si se desactiva el estado que era el primero por `orden`, el alta de un ticket nuevo usa el siguiente estado activo por `orden` (Q18).
  - Renombrar un estado con `clave` (por ejemplo, Finalizado → Resuelto) no afecta ninguna regla de SPEC 05, porque esas reglas usan `clave`, no `nombre` (D1).
  - Eliminar un estado con `clave` no nula: rechazado siempre, incluso si ningún ticket lo usa (D1).
  - Eliminar un estado sin `clave` que está en uso: 409, igual que Feature 4.1.
- **MUST NOT:** un enum de estados en código; una casilla `cerrado` o `inicial`; lógica del tipo `if (nombre === "Finalizado")` en ningún módulo — siempre se compara contra `clave`.

## Plan de implementación

1. Modelos Prisma de los 7 catálogos + migración, con `nombreNormalizado` calculado en el service (no en la base) y el índice único parcial sobre `deletedAt IS NULL`. Verificar: `prisma migrate dev` aplica limpio.
2. `packages/contracts/src/catalogs.ts` con un esquema de entrada y salida por catálogo. Verificar: `pnpm --filter @syc/contracts typecheck` pasa.
3. Repository compartido (extiende el helper de SPEC 03) con el chequeo de nombre único normalizado y el chequeo de "en uso" antes de eliminar. Verificar: test unitario que intenta duplicar un nombre normalizado y falla.
4. Módulos de Área, Edificio, TipoTicket, Prioridad, Modulo, Proveedor (router + service + repository), todos detrás de `@RequirePermission("admin")` para mutar y sesión simple para leer. Verificar: un agente que intenta crear un Área recibe 403; leer funciona.
5. Módulo `EstadoTicket` con la regla de `clave` inmutable y la protección del último estado activo. Verificar: intentar eliminar "Finalizado" devuelve 409 aunque no esté en uso; desactivar el único estado activo devuelve 409.
6. Seed: agregar los 7 estados (con sus claves) a `packages/db/src/seed.ts`, idempotente. Verificar: correrlo dos veces no duplica.
7. `apps/web`: pantallas `routes/_authenticated/settings/<catalogo>` con tabla + formulario, reutilizando componentes de `components/ui`. Verificar: el admin crea, edita, desactiva y elimina un ítem de prueba desde la UI.
8. `features/catalogs/hooks`: `useAreas()`, `useEstados()`, etc., que devuelven solo los ítems activos ordenados, para que SPEC 05 los consuma directo. Verificar: el hook filtra los inactivos.
9. Tests Vitest: un `*.service.spec.ts` por catálogo (nombre duplicado, eliminar en uso) y uno específico para `EstadoTicket` (clave inmutable, último activo). Verificar: `pnpm --filter @syc/api test` pasa.

## Criterios de aceptación

- [ ] El admin crea, edita, reordena, desactiva, reactiva y elimina un ítem en cada uno de los 7 catálogos desde la UI, sin deploy.
- [ ] Crear "Área" y "área" en el mismo catálogo: el segundo devuelve 409.
- [ ] Eliminar un ítem y volver a crear uno con el mismo nombre: funciona.
- [ ] Intentar eliminar "Finalizado", "Cerrado", "Cancelado" o "Reabierto": siempre 409, esté o no en uso.
- [ ] Desactivar o eliminar el único estado activo restante: 409.
- [ ] Un Proveedor con solo el nombre cargado se guarda correctamente; con un correo o sitio web mal formados, se rechaza.
- [ ] Un agente que intenta mutar cualquier catálogo recibe 403; leer catálogos le funciona.
- [ ] `pnpm turbo lint typecheck test build` termina con código 0.

## Decisiones

- **Sí:** `clave` interna fija para los 4 estados de sistema, en vez de comparar por nombre (D1). Reemplaza la casilla `cerrado` de P8 del PRD; requiere actualizar `docs/prd.md` §6.2 y §11.1.
- **Sí:** catálogos globales, ninguno por departamento (Q15). Es lo que ya describía el modelo de datos del PRD §8.3; queda confirmado.
- **Sí:** nombre único normalizado (trim, sin mayúsculas, sin acentos) por catálogo, no global entre catálogos (Q14).
- **No:** una tabla de catálogos genérica con discriminador de tipo. Cada catálogo es un modelo Prisma propio, siguiendo la regla 2 de `docs/architecture.md` (migraciones, no motor de entidades genérico).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `nombreNormalizado` calculado en el service puede desincronizarse de `nombre` si se edita mal. | El repository siempre recalcula `nombreNormalizado` a partir de `nombre` en cada `create`/`update`; nunca se acepta desde el cliente. |
| El índice único parcial (`WHERE deleted_at IS NULL`) no es una migración estándar de `prisma migrate dev` desde el schema declarativo. | Se agrega como SQL manual dentro de la migración generada, documentado en el archivo de migración con un comentario que explica por qué. |
| Los 4 estados con `clave` son datos de seed, no de schema: nada impide borrar la fila a mano en la base fuera de la API. | Fuera del alcance de este spec (es un riesgo operativo del servidor, no del código); se puede mitigar con un backup, cubierto en SPEC 07. |

## Qué **no** está en este spec

- Tickets y sus formularios completos (SPEC 05).
- Campos personalizados sin deploy (Fase 2).
- Pantalla de auditoría global (SPEC 03, fuera del MVP).
