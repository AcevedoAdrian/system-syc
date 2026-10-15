# SPEC 10 — Color de estados y prioridades

> **Status:** Approved
> **Depends on:** SPEC 03 (auditoría y eliminación lógica), SPEC 04 (catálogos), SPEC 05 (tickets núcleo), SPEC 06 (comentarios y bandeja), SPEC 09 (base visual)
> **Date:** 2026-10-15
> **Objective:** que el administrador elija, entre los 8 tonos de la base visual, el color de cada estado y de cada prioridad, y que ese color se vea como insignia en la bandeja, el detalle del ticket, los desplegables y la administración de catálogos.

## Por qué existe este spec

Hoy `EstadoTicket` y `Prioridad` son ítems de catálogo sin color:

- El estado se muestra siempre con la misma insignia gris (`Badge variant="secondary"`) en la bandeja y en el detalle.
- La prioridad es texto plano en la bandeja y no aparece en el encabezado del detalle.
- En una bandeja de 20 filas, «Urgente» y «Baja» se leen con el mismo peso visual que «Pendiente» y «Finalizado».

El SPEC 09 definió los 8 tonos (`gris`, `rojo`, `naranja`, `amarillo`, `verde`, `azul`, `violeta`, `rosa`) con contraste AA en claro y oscuro, y dejó dicho que son «el vocabulario del SPEC 10»: este spec les da uso.

Decisiones del usuario del 2026-10-15:

- El color se ve en administración, bandeja, detalle y en los desplegables (filtros de la bandeja, alta y edición del ticket, cambio de estado). Solo cambia la insignia: la estructura de esas pantallas es del SPEC 11.
- El color es obligatorio, y gris por defecto.
- Los estados y prioridades que ya existen arrancan con una propuesta de color, tanto en el seed como en la migración.
- El admin elige el color en un desplegable, cuyas opciones son las insignias con el nombre del color.
- Dos estados (o dos prioridades) pueden tener el mismo color.
- En `/admin/catalogos`, Estados y Prioridades suman una columna «Color», con el nombre del color.
- El encabezado del detalle muestra el estado y la prioridad como insignias de color.

## Alcance

**Dentro:**

- Un enum `Tono` en Prisma y el campo `color` en `EstadoTicket` y `Prioridad`.
- La migración `color_estados_prioridades`, que asigna la propuesta de color a lo que ya existe.
- Contratos en `packages/contracts`:
  - la lista única de tonos (`tonos`, `tonoSchema`);
  - `color` en el alta, la edición y la salida de `prioridades` y `estados`;
  - `color` en la referencia `estado` y `prioridad` de los tickets.
- API:
  - `catalog-definitions.ts`: `color` como campo de entrada y de la foto auditable en `prioridades` y `estados`;
  - los selects de `estado` y `prioridad` de los tickets traen `color`;
  - el seed carga el color.
- Web:
  - el campo «Color» (desplegable) en el alta y la edición de un estado o prioridad;
  - la columna «Color» en su tabla;
  - estado y prioridad como insignia de color en la bandeja y en el encabezado del detalle;
  - las opciones de los desplegables de estado y prioridad (filtros, alta y edición del ticket, cambio de estado) como insignias de color;
  - `TonoSelect` y las etiquetas de los tonos, también en la galería `/estilos`.
- `seed-data/estados.json` y `seed-data/prioridades.json` con color.
- `scripts/verify/specs/10-color-estados-prioridades.mjs`.
- Actualizar `CLAUDE.md`, `docs/base-visual.md`, `docs/prd.md` (si describe los campos de estado y prioridad), `seed-data/README.md` (si describe el formato) y `specs/00-catalogo-specs.md`.

**Fuera de alcance (para specs futuros):**

- Color en los otros 6 catálogos (Áreas, Tipos de área, Edificios, Tipos de ticket, Módulos, Proveedores).
- Un color libre (selector hexadecimal o rueda de color). El vocabulario son los 8 tonos.
- Tonos nuevos. Agregar uno es migración + `index.css` + contraste + contratos (`docs/base-visual.md`).
- Guardar el color en el historial del ticket.
- Rediseñar la bandeja, el detalle o la administración (SPEC 11).
- Ordenar o agrupar la bandeja por color.
- Que el color tenga significado para el sistema (por ejemplo, que «rojo» implique urgencia). Es solo presentación.

## Modelo de datos

```prisma
// packages/db/schema.prisma (fragmento)

// Los 8 tonos de insignia de la base visual (SPEC 09). El admin elige uno por estado y prioridad.
enum Tono {
  gris
  rojo
  naranja
  amarillo
  verde
  azul
  violeta
  rosa
}

model Prioridad {
  // … campos existentes …
  color Tono @default(gris)
}

model EstadoTicket {
  // … campos existentes …
  color Tono @default(gris)
}
```

`@default(gris)` solo existe para que la migración pueda agregar la columna `NOT NULL` sobre filas existentes. La API nunca lo usa: el contrato exige `color` en cada alta y edición.

**Migración `color_estados_prioridades`.** En este orden:

1. `CREATE TYPE "Tono" AS ENUM (…)` con los 8 valores.
2. `ALTER TABLE "estado_ticket"` y `"prioridad"`: `ADD COLUMN "color" "Tono" NOT NULL DEFAULT 'gris'`.
3. Estados de sistema, por `clave` (el nombre puede haber cambiado, D1 de SPEC 04):

   | Clave | Color |
   |---|---|
   | `FINALIZADO` | verde |
   | `CERRADO` | gris |
   | `CANCELADO` | rojo |
   | `REABIERTO` | naranja |

4. Estados sin clave, por `"nombreNormalizado"`:

   | Nombre normalizado | Color |
   |---|---|
   | `pendiente` | azul |
   | `en progreso` | violeta |
   | `en espera` | amarillo |

5. Prioridades, por `"nombreNormalizado"`:

   | Nombre normalizado | Color |
   |---|---|
   | `baja` | gris |
   | `media` | azul |
   | `alta` | naranja |
   | `urgente` | rojo |

6. Todo lo que no coincide queda en `gris` (el valor por defecto del paso 2).

Los `UPDATE` incluyen las filas eliminadas lógicamente: no cuesta nada y evita un caso especial.

La migración **no** escribe `AuditLog`: asignar el valor inicial de un campo nuevo no es una acción de un usuario. El historial de cada ítem muestra el color desde su primer cambio. Es la misma decisión que SPEC 08 tomó para el tipo «Otro» de las áreas.

**Seed.** `seed-data/estados.json` suma `color` en cada ítem. `seed-data/prioridades.json` pasa de una lista de textos a `[{ "nombre": "Baja", "color": "gris" }, …]`, como `estados.json`. El seed sigue cargando solo catálogos vacíos (SPEC 04).

```json
// seed-data/estados.json
[
  { "nombre": "Pendiente", "color": "azul" },
  { "nombre": "En progreso", "color": "violeta" },
  { "nombre": "En espera", "color": "amarillo" },
  { "nombre": "Finalizado", "clave": "FINALIZADO", "color": "verde" },
  { "nombre": "Cerrado", "clave": "CERRADO", "color": "gris" },
  { "nombre": "Cancelado", "clave": "CANCELADO", "color": "rojo" },
  { "nombre": "Reabierto", "clave": "REABIERTO", "color": "naranja" }
]
```

## Contrato

### Feature 10.1 — Lista única de tonos

- `packages/contracts/src/catalogs.ts` exporta `tonos` (la tupla de los 8 valores) y `tonoSchema = z.enum(tonos)`.
- `apps/web/src/components/ui/badge.tsx` deja de declarar su lista: `badgeTonos` y `BadgeTono` salen de `@syc/contracts`. Los tests del SPEC 09 siguen con los mismos nombres.
- `badge.tsx` suma `tonoLabels: Record<BadgeTono, string>` («Gris», «Rojo», «Naranja», «Amarillo», «Verde», «Azul», «Violeta», «Rosa»). Es el único lugar con esos textos.
- Un test exige que `tonos` y las claves de `tonoClasses` y `tonoLabels` coincidan: un tono agregado en un lugar y no en otro rompe el build, no el navegador.

### Feature 10.2 — Catálogos Prioridades y Estados con color

| Procedimiento | Cambio |
|---|---|
| `catalogs.prioridades.create` / `update` | La entrada pasa de `{ nombre }` a `{ nombre, color }`. `color` es obligatorio. |
| `catalogs.estados.create` / `update` | Igual. `clave` sigue sin aceptarse en ninguna entrada. |
| `catalogs.prioridades.list` / `setActive` y los equivalentes de `estados` | La salida suma `color`. |
| `catalogs.<…>.history` | El diff de un cambio de color es `color: { antes, despues }`, como cualquier otro campo (SPEC 03). |

Reglas:

- `color` fuera de los 8 tonos → 400 (lo rechaza Zod, antes del service).
- `update` reemplaza todos los campos (SPEC 04): cambiar solo el nombre exige reenviar el `color` actual. La web lo hace sola, porque el formulario trae el color cargado.
- Cambiar el color de un ítem actualiza `updatedAt` y `updatedBy`, y deja un `AuditLog` `update`. Un `update` que no cambia nada sigue sin generar entrada (SPEC 03).
- La unicidad de nombre, `lastActive` y `keyedNotRemovable` no cambian. El color no participa de ninguna regla.
- Los 6 catálogos restantes no cambian de contrato.

### Feature 10.3 — Color en los tickets

- `tickets.ts`: `prioridad` pasa a `refSchema.extend({ color: tonoSchema })` y `estado` a `refSchema.extend({ clave, color: tonoSchema })`. Aplica a `tickets.get`, a cada fila de `tickets.list` y a la salida de `tickets.create`, `update` y `changeStatus`.
- Los selects de `estado` y `prioridad` de `tickets.repository.ts` traen `color`, y `changeStatus` lo devuelve en el estado destino.
- La **foto auditable del ticket no cambia**: `ref()` sigue guardando `{ id, nombre }`. Recolorear un estado no ensucia el historial de ningún ticket, y el historial muestra el nombre que el ítem tenía al guardar (SPEC 05).
- Los filtros de `tickets.list` (`estadoId`, `prioridadId`) no cambian.

### Feature 10.4 — Web

Todo con `<Badge tono={…}>`. El nombre del estado o de la prioridad va siempre dentro de la insignia: el color nunca va solo (regla 5 de `docs/base-visual.md`).

**Administración (`/admin/catalogos`):**

- El alta y la edición de un estado o prioridad suman el campo «Color», un `TonoSelect`. En el alta viene con «Gris»; en la edición, con el color actual.
- `TonoSelect` es un desplegable de los 8 tonos: cada opción es la insignia con el nombre del color («Rojo»), y el botón muestra la elegida. Vive en `features/catalogs/components/`.
- La tabla de Estados y de Prioridades suma la columna «Color», entre «Nombre» y «Estado»: la insignia con el nombre del color, no con el del ítem. El nombre del ítem queda como texto.
- Los otros 6 catálogos no ven ni el campo ni la columna.

**Tickets:**

- `TicketsTable`: la columna «Estado» y la columna «Prioridad» muestran una insignia con el color y el nombre del ítem.
- `TicketDetail`: el encabezado muestra, junto al departamento, la insignia del estado y la de la prioridad.
- `CatalogOptionSelect` (`FlatOptionSelect`) y `TicketsFilters` (`FilterSelect`): cuando el ítem trae `color`, cada opción se ve como insignia, y el botón del selector muestra el valor elegido también como insignia.
  - El ítem actual desactivado sigue marcándose «(inactivo)»; la marca va fuera de la insignia.
  - La opción «Todos» de los filtros y la «sin valor» de los campos opcionales siguen como texto.
  - El nombre accesible de cada opción sigue siendo el nombre del ítem: `getByRole("option", { name })` no cambia.
- Áreas y el resto de los catálogos no cambian en los desplegables.

**Galería `/estilos`:** suma `TonoSelect`, y los tonos usan `tonoLabels`.

### Qué ve cada rol

Sin cambios: cualquier usuario con sesión ve el color (viene en `catalogs.<…>.list` y en los tickets que ya puede leer); solo el admin lo elige, porque crear y editar un catálogo ya es solo del admin (SPEC 04).

## Plan de implementación

1. **Esquema y migración.**
   - El enum `Tono` y `color` en `Prioridad` y `EstadoTicket`, en `schema.prisma`.
   - La migración `color_estados_prioridades` con los pasos del modelo de datos.

   Verificar:
   - `prisma migrate dev` aplica limpio, y un segundo `migrate dev` no genera nada;
   - sobre una copia de la base de desarrollo, «Finalizado» queda verde, «Urgente» rojo, y un estado creado a mano («Esperando repuesto») queda gris;
   - un estado de sistema renombrado («Finalizado» → «Hecho») conserva el verde.
2. **Contratos.** `tonos` y `tonoSchema`; el esquema de entrada con `color` para `prioridades` y `estados`, y el de salida con `color`; `color` en las referencias de `tickets.ts`. Verificar con `catalogs.spec.ts` y `tickets.spec.ts`:
   - un alta sin `color`, o con `"fucsia"`, se rechaza;
   - las salidas incluyen `color`;
   - `tonos` coincide con el enum de Prisma (comparación en un test, leyendo los valores generados).
3. **API, catálogos.** `catalog-definitions.ts`: `inputFields: ["nombre", "color"]` y `color` en `snapshotFields` de `prioridades` y `estados`. Verificar con `catalogs.service.spec.ts`:
   - el alta guarda el color y lo devuelve;
   - cambiar solo el color deja un `update` con ese diff;
   - un `update` con el mismo color no genera entrada.
4. **API, tickets.** `color` en los selects de `estado` y `prioridad` de `tickets.repository.ts` y en el estado que devuelve `changeStatus` (`tickets.service.ts`). Verificar con `tickets.service.spec.ts`:
   - `get`, `list` y `changeStatus` traen `color`;
   - cambiar el color de un estado no agrega entradas al historial de un ticket que lo usa.
5. **Seed.** `estadosSchema` y `prioridadesSchema` (`apps/api/src/seed-data.ts`) aceptan `color`, y `seedIfEmpty` lo escribe; `estados.json` y `prioridades.json` traen la propuesta. Verificar con `seed-data.spec.ts`:
   - un color inválido aborta nombrando el archivo y el ítem;
   - un ítem sin `color` se carga en gris.
6. **Web, base.** `badgeTonos` desde `@syc/contracts`, `tonoLabels` y el test de coincidencia (Feature 10.1). Verificar: los tests de `badge.test.tsx` y de la galería pasan sin cambios.
7. **Web, administración.** `TonoSelect`, el campo en `CatalogItemFormDialog` y la columna en `CatalogTable`, solo para Estados y Prioridades. Verificar con tests:
   - el alta de un estado sin tocar el color manda `gris`;
   - editar un estado manda su color actual;
   - la tabla de Edificios no tiene la columna «Color».
8. **Web, tickets.** `TicketsTable`, `TicketDetail`, `CatalogOptionSelect` y `FilterSelect` (Feature 10.4). Verificar con tests:
   - la bandeja muestra el estado y la prioridad con el `data-tono` del ítem;
   - el encabezado del detalle muestra las dos insignias;
   - un desplegable de estado muestra sus opciones con tono, y `getByRole("option", { name: "Urgente" })` las encuentra;
   - el valor actual desactivado conserva «(inactivo)».
9. **Verify.** `scripts/verify/specs/10-color-estados-prioridades.mjs` con `defineSpec`, registrado en `scripts/verify/specs/index.mjs` y reutilizando los fixtures de `lib/fixtures.mjs`. Los fixtures y verify existentes (04, 05, 06, 08) que crean un estado o una prioridad pasan a mandar `color`. Verificar: `pnpm verify --spec 04,05,06,08,10` pasa.
10. **Documentación.**
    - `CLAUDE.md`: el estado del repo suma el SPEC 10, la migración `color_estados_prioridades`, y `pnpm verify` pasa a «SPEC 01 a 10».
    - `docs/base-visual.md`: las dos menciones al SPEC 10 pasan a decir que ya está hecho.
    - `docs/prd.md` y `seed-data/README.md`, si describen los campos de estado y prioridad o el formato de los archivos.
    - `specs/00-catalogo-specs.md`: la fila de SPEC 10.
    - `apps/web/CLAUDE.md`: una línea sobre `TonoSelect` y que el color de un estado o prioridad sale del dato, nunca del nombre.

    Verificar: `pnpm turbo lint typecheck test build` y `pnpm verify --spec 04,05,06,08,10` terminan con código 0.

## Criterios de aceptación

- [ ] Después de `prisma migrate deploy` sobre una base con los datos del seed anterior, los 7 estados y las 4 prioridades tienen la propuesta de color y no existe ninguna fila con `color` nulo.
- [ ] Un estado o prioridad creado a mano antes de la migración queda en `gris`.
- [ ] Un estado de sistema cuyo nombre fue cambiado conserva el color de su `clave`.
- [ ] La migración no crea ningún `AuditLog`.
- [ ] `catalogs.estados.create` y `catalogs.prioridades.create` sin `color`, o con un valor que no es uno de los 8 tonos, devuelven 400.
- [ ] Crear y editar un estado o prioridad con `color` lo devuelve en `list`, y el `history` muestra el diff `color: { antes, despues }`.
- [ ] Un agente recibe 403 en `create` y `update` de `estados` y `prioridades`, y 200 en `list` con `color`.
- [ ] `tickets.get`, cada fila de `tickets.list` y `tickets.changeStatus` traen `estado.color` y `prioridad.color`.
- [ ] Cambiar el color de un estado no agrega ninguna entrada al historial de los tickets que lo tienen.
- [ ] Los otros 6 catálogos rechazan o ignoran `color` como hoy: su contrato no lo declara.
- [ ] El seed sobre una base vacía deja los 7 estados y las 4 prioridades con la propuesta. Un `color` inválido en el archivo aborta nombrándolo y no crea ítems.
- [ ] En la web, la tabla de Estados y de Prioridades muestra la columna «Color» con el nombre del color, y la de Edificios no la tiene.
- [ ] En la web, el alta de un estado sin tocar el color manda «Gris»; elegir «Rojo» en el desplegable lo manda y la tabla lo refleja.
- [ ] En la web, la bandeja y el encabezado del detalle muestran estado y prioridad con la insignia del color del ítem, y el nombre va dentro de la insignia.
- [ ] En la web, los desplegables de estado y prioridad (filtros, alta, edición y cambio de estado) muestran las opciones con su insignia, y el valor actual desactivado conserva «(inactivo)».
- [ ] `pnpm lint` no encuentra colores sueltos: todo sale de los tokens `tono-*`.
- [ ] `pnpm verify --spec 04,05,06,08,10` y `pnpm turbo lint typecheck test build` terminan con código 0.

## Decisiones

- **Sí:** el color se ve en todas las pantallas donde aparece un estado o una prioridad, desplegables incluidos (decisión del usuario, 2026-10-15). Un color que solo se ve en la administración no sirve para leer la bandeja.
- **Sí:** el color es obligatorio y gris por defecto (decisión del usuario, 2026-10-15). Evita el caso «sin color» en el contrato y en cada pantalla.
- **Sí:** la propuesta de color va en el seed y en la migración (decisión del usuario, 2026-10-15). Un servidor que ya está cargado queda coloreado sin que el admin haga nada.
- **Sí:** la migración asigna por `clave` en los estados de sistema y por `nombreNormalizado` en el resto. El nombre de un estado de sistema puede haber cambiado (D1 de SPEC 04); la clave, no.
- **No:** un `AuditLog` por cada ítem que la migración colorea. Es el valor inicial de un campo nuevo, no una acción de un usuario. Igual que SPEC 08 con «Otro».
- **Sí:** un enum de Postgres (`Tono`) y no un texto libre. La base rechaza un valor que no existe, y agregar un tono ya es una decisión de diseño (`docs/base-visual.md`) que pide migración de todas formas.
- **Sí:** una sola lista de tonos, en `@syc/contracts`. La API, la web y el enum de Prisma se comparan en tests: un tono nuevo en un lugar y no en otro falla en CI.
- **Sí:** el admin elige con un desplegable de insignias (decisión del usuario, 2026-10-15). Es un campo más del formulario, como los otros.
- **Sí:** los colores se pueden repetir dentro de un catálogo (decisión del usuario, 2026-10-15). Hay 7 estados y 8 tonos: una restricción de unicidad impediría el estado número 9. El nombre va siempre dentro de la insignia, así que dos estados del mismo color se distinguen.
- **Sí:** columna «Color» aparte en la administración (decisión del usuario, 2026-10-15). El nombre queda como texto y el color se lee con su nombre, no solo por su aspecto.
- **Sí:** estado y prioridad como insignias en el encabezado del detalle (decisión del usuario, 2026-10-15). Es el único cambio de estructura que se admite antes del SPEC 11, porque la prioridad no aparecía.
- **No:** guardar el color en la foto auditable del ticket. El color es presentación y cambia por decisión del admin; el historial del ticket guarda lo que se sabe del ticket (`{ id, nombre }`).
- **No:** que el color tenga significado para el sistema. Ninguna regla (estado de cierre, prioridad mínima, filtros) mira el color.
- **Sí:** solo Estados y Prioridades. Son los únicos catálogos que un agente lee como estado de un ticket de un vistazo; el resto son datos de clasificación.
- **No:** rediseñar pantallas. Cambia la insignia, no el diseño de la bandeja ni del detalle (SPEC 11).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un estado o prioridad que el admin renombró antes de migrar no coincide con la propuesta y queda gris. | Es un dato, no un error: el admin lo colorea desde `/admin/catalogos`. Los estados de sistema no dependen del nombre. |
| Dos valores iguales dentro de un catálogo (porque se permite repetir) hacen que un estado se confunda con otro. | El nombre va siempre dentro de la insignia, y el color nunca va solo. |
| El enum de Prisma, la lista del contrato y las clases de `badge.tsx` se desalinean al agregar un tono. | Los tests de la Feature 10.1 y de la tarea 2 fallan en CI. |
| Los desplegables con insignias cambian lo que leen los tests y los lectores de pantalla. | El nombre accesible de cada opción sigue siendo el nombre del ítem; el criterio de aceptación exige que `getByRole("option", { name })` siga funcionando. |
| Los fixtures de los verify 04, 05, 06 y 08 crean estados y prioridades sin `color` y se rompen. | El paso 9 los actualiza, y el criterio de aceptación exige que pasen. |
| `update` reemplaza todos los campos: una herramienta que edita solo el nombre ahora recibe 400. | La web manda el color actual. Quien use la API directa (Bruno, scripts) tiene que reenviarlo: queda dicho en la Feature 10.2 y en los requests de `bruno/catalogs/` que se tocan. |
| Un `seed-data/prioridades.json` en el formato viejo (lista de textos) ya no valida. | El archivo está en git y se actualiza en este spec. El schema del seed acepta además un texto suelto, que carga en gris, y el test del paso 5 lo cubre. Una base ya cargada no se afecta: el seed no toca catálogos con filas. |

## Qué **no** está en este spec

- Color en Áreas, Tipos de área, Edificios, Tipos de ticket, Módulos y Proveedores.
- Color libre (hexadecimal) o tonos nuevos.
- El color en el historial del ticket.
- Rediseñar la bandeja, el detalle o la administración (SPEC 11).
- Ordenar o agrupar tickets por color.
- Que el color tenga efecto sobre alguna regla del sistema.

Cada uno, si hace falta, va en su propio spec.
