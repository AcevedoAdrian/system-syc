# PRD — Sistema de gestión interna

**Proyecto:** system-syc  
**Fecha:** septiembre 2026  
**Estado:** cáscara definida; primer dominio = seguimiento de tickets

Este documento es la fuente de verdad del **producto**: para qué existe el sistema, qué entra en cada etapa y qué quedó decidido. No reemplaza a los otros documentos:

| Documento | Qué manda |
|---|---|
| `PRD2.md` (este) | Meta, alcance, decisiones de producto y etapas |
| [`STACK.md`](./STACK.md) | Por qué este stack y cómo se organiza el código |
| [`README.md`](./README.md) | Cómo instalar y correr el proyecto |
| `specs/` | Contrato de implementación de cada etapa |

Si una decisión de producto de este archivo choca con `STACK.md`, se actualizan los dos en el mismo cambio. La tecnología no se reabre acá: ya está cableada en el repositorio.

---

## 1. Meta

Una aplicación web interna, de un solo equipo, que reemplaza el registro manual de requerimientos en Notion.

Hoy el dominio es el **seguimiento de tickets**. La aplicación es una cáscara: cada capacidad nueva entra como un módulo propio (auditoría, catálogos, tickets, y más adelante inventario, notas internas o tareas) sin rehacer lo anterior.

El sistema lo usa solo el personal del área. No hay usuarios externos ni registro público.

## 2. Problema

El trabajo se anota en Notion. Eso limita:

- Reconstruir quién cambió un ticket y cuándo.
- Relacionar el origen interno (actuación simple) con el número de seguimiento de la empresa proveedora.
- Separar lo que ve y puede hacer un administrador de lo que ve un agente de un departamento.
- Crecer hacia otros dominios con relaciones reales entre datos.

## 3. Qué ya está construido

SPEC 01 (esqueleto) está hecho. `docker compose up` levanta Postgres 17, la API y la web.

| Pieza | Estado |
|---|---|
| Monorepo pnpm + Turborepo, Biome, Vitest, GitHub Actions | Hecho |
| Contratos oRPC + Zod (`health.check`) | Hecho |
| NestJS con módulo `health` (controller, service, repository) | Hecho |
| Prisma 7.10, schema vacío, sin migraciones | Hecho |
| Web: Vite, React 19, TanStack Router y Query, Tailwind, shadcn | Hecho |
| Ruta `/` que muestra si Postgres responde | Hecho |
| Better Auth, usuarios, permisos, catálogos, tickets, auditoría | No existe |
| TanStack Table, react-hook-form, Playwright, `packages/ui` | No existen; entran cuando hagan falta |
| Docker de producción | No existe |

## 4. Stack (resumen)

El detalle y las alternativas descartadas están en [`STACK.md`](./STACK.md).

| Capa | Elección |
|---|---|
| Monorepo | pnpm + Turborepo |
| Lenguaje | TypeScript strict, Node 22 |
| API | NestJS + oRPC (expone REST/OpenAPI) + Zod en `packages/contracts` |
| Datos | PostgreSQL 17 + Prisma (versión mayor fija) |
| Acceso | Better Auth, plugin `organization` |
| Web | Vite + React (SPA), TanStack Router, Query y Table |
| Formularios | react-hook-form + los Zod de `contracts` |
| UI | Tailwind + shadcn/ui. Textos de pantalla en español |
| Calidad | Biome, Vitest, Playwright cuando haya un flujo de usuario |
| Entorno | Docker Compose en desarrollo |

Decisiones tomadas al contrastar el PRD original con el stack ya implementado:

- **Sin Zustand.** El estado del servidor lo lleva TanStack Query. Un store de UI se agrega solo si aparece un caso concreto.
- **oRPC se queda.** Ya recorre contracts → api → db → web. REST + Swagger + Orval queda como plan B, documentado en `STACK.md`.
- **Sin Nginx ni Docker de producción** hasta tener un flujo real que desplegar.
- **Campos creados desde la pantalla** (JSONB + definiciones) no entran en estas etapas. Un campo nuevo, por ahora, es una migración y un contrato.
- **Nombres en inglés** en Prisma, contratos y código (`internalRequestNumber`, `externalTicketNumber`). Las etiquetas de la interfaz van en español.

## 5. Decisiones de producto cerradas

**Organizaciones.** Cada departamento de trabajo (Administrativo, Técnico, Redes, Desarrollo) es una organización de Better Auth. El ticket pertenece a esa organización. No hay una tabla `Departamento` paralela.

Consecuencia: mover un ticket de un departamento a otro es cambiarlo de organización. Eso no entra en tickets v1.

**Acceso.** No hay registro público. Un administrador crea las cuentas, las asigna a una o más organizaciones y puede desactivarlas. Desactivar no borra la fila.

**Visibilidad.** Un agente ve y actualiza solo los tickets de las organizaciones de las que es miembro. El administrador ve todas.

**Asignación.** En tickets v1 el ticket no tiene responsable individual. Vive en la bandeja del departamento.

**Auditoría.** Cada tabla de negocio lleva `createdAt` y `updatedAt`. El historial es un módulo `audit` polimórfico (`entityType`, `entityId`, `actorId`, `action`, `payload`, `createdAt`), reusable por cualquier módulo futuro. No hay tabla `TicketHistory` aparte ni `deletedAt` en todas las tablas.

**Idioma de datos.** Inglés en el modelo. Español en la interfaz.

## 6. Modelo de dominio (primera versión)

Tres pilares. Los nombres de campos finos se cierran en el spec de cada etapa.

1. **Acceso (Better Auth).** Usuario, sesión, organización (departamento), membresía. El administrador global crea usuarios y membresías. El mapa exacto de roles del plugin se define en la etapa de acceso.
2. **Catálogos.** Datos maestros que el ticket referencia y que no son la organización: áreas solicitantes y edificios. Departamentos no van en este pilar.
3. **Tickets.** Entidad del primer dominio. Pertenece a una organización. Referencia área y edificio. Lleva, como mínimo, la referencia interna de actuación simple (opcional), el número de la empresa proveedora (opcional), estado, prioridad, tipo y el texto de la solución. Las notas libres son registros propios del ticket (autor, fecha, texto), no un reemplazo del módulo `audit`.

Relaciones entre entidades: columnas y claves foráneas, no IDs sueltos dentro de JSON.

## 7. Etapas

Cada etapa se escribe como un spec en `specs/` y se implementa cuando el spec está aprobado. El corte sigue el criterio de SPEC 01: una etapa tiene que poder verificarse sola.

### Etapa 0 — Esqueleto

Hecha. Ver SPEC 01 y la sección 3.

### Etapa 1 — Acceso

Siguiente paso. Better Auth integrado en Nest y en la web.

Incluye: login, cookie de sesión, alta y desactivación de usuarios por el administrador, alta de las organizaciones-departamento, membresía de un usuario en una o más organizaciones, layout detrás de login.

No incluye: permisos finos por acción, auditoría, catálogos, tickets.

### Etapa 2 — Permisos y auditoría

Guards de Nest a nivel de módulo o endpoint (la regla de `STACK.md`). El servicio no consulta permisos por su cuenta.

Incluye: distinción administrador / agente acorde a la visibilidad ya decidida, módulo `audit` polimórfico listo para que otro módulo lo llame.

No incluye: pantalla de historial de tickets (llega con el ticket), campos dinámicos.

### Etapa 3 — Catálogos

Áreas solicitantes y edificios. Alta, edición y desactivación por el administrador.

No incluye: una tabla de departamentos.

Queda abierto para el spec de esta etapa: si `tipo` y `módulo` del ticket son catálogos editables o enums en código. Ver sección 9.

### Etapa 4 — Tickets v1

Alta y edición. Bandeja de la organización activa. Estados. Actuación simple y número externo opcionales. Texto de solución. Notas libres. Cada mutación y cada nota queda en `audit`.

No incluye: responsable individual, filtros y búsqueda, pasar el ticket a otro departamento, reabrir, estado “en espera del proveedor”, adjuntos, correo.

## 8. Después de tickets v1

No forman parte de las cuatro etapas. Cada uno, si se hace, es un spec o un módulo nuevo:

- Filtros y búsqueda de la bandeja.
- Transferir un ticket a otra organización.
- Reabrir un ticket cerrado.
- Estado de espera del proveedor.
- Asignación opcional a una persona.
- Adjuntos.
- Avisos por correo.
- Importación histórica desde Notion.
- Usuarios de fuera del área.
- Campos creados por un administrador sin deploy.
- Inventario, notas internas generales, tareas.
- Despliegue de producción.

## 9. Pendiente de confirmar en el spec correspondiente

Estas preguntas no cambian la cáscara. No están cerradas:

- Lista exacta de estados de tickets v1. El PRD original proponía Pendiente, En progreso y Finalizado, más un indicador de “notificado”. El estado de espera del proveedor quedó fuera de v1.
- Si prioridad, tipo y módulo son enums o catálogos, y si “módulo” significa algo distinto del departamento.
- Cómo se representa al administrador global en Better Auth (rol de plataforma frente a rol dentro de cada organización).
- Si un agente con varias membresías elige la organización activa o ve una bandeja combinada. La regla de visibilidad ya está cerrada: solo ve las suyas; el administrador ve todas.

## 10. Siguiente paso

Escribir y aprobar el spec de la **etapa 1 (acceso)** antes de implementar Better Auth.
