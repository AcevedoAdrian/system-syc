# PRD — Sistema de Gestión Interna y Seguimiento de Tickets

**Autor:** Adrián Hugo Acevedo
**Versión:** 3
**Fecha:** 25 de septiembre de 2026
**Estado:** Aprobado

> **Este documento es la fuente de verdad del producto**: qué es el sistema, para quién y en qué orden se desarrolla. La fuente de verdad del stack y la arquitectura es `docs/architecture.md`, que conserva el razonamiento detallado de cada elección tecnológica.

---

## 1. Meta del sistema

Construir una **cáscara extensible** para la gestión interna de un área tecnológica y administrativa. Hoy el foco es el **seguimiento de tickets**; a futuro se agregarán otras funcionalidades (inventario, notas internas, tareas, etc.) **como módulos nuevos, sin tocar los existentes**.

Consecuencias de diseño que salen de esa meta:

- Un solo backend y un solo frontend, organizados por módulos de negocio independientes (monolito modular).
- Autenticación, departamentos, permisos y auditoría son **transversales**: los usan todos los módulos presentes y futuros.
- Tickets es el **primer módulo de negocio**, no el centro del sistema.



## 2. Problema

Hoy los requerimientos se registran a mano en una base de Notion, lo que genera:

- **Falta de trazabilidad:** no se sabe con precisión quién cambió un estado ni cuándo.
- **Escalabilidad limitada:** Notion no sostiene bien relaciones complejas ni integridad de datos.
- **Desacople:** no hay un vínculo fuerte entre la solicitud interna (Actuación Simple) y el ticket del proveedor externo.
- **Permisos:** no hay control de acceso por departamento.



## 3. Solución

Un sistema in-house, usado solo por el equipo interno, con base relacional (PostgreSQL), carga rápida de tickets, historial de auditoría automático y permisos por departamento. Corre en un servidor Linux on-premise con Docker Compose.

## 4. Usuarios, departamentos y permisos



### 4.1 Modelo

- **Departamento =** `Organization` **de Better Auth** (Administrativo, Técnico, Redes, Desarrollo). No existe una tabla `Departamento` aparte.
- Un **usuario pertenece normalmente a un solo departamento** (`Member` con rol `agente`). El modelo permite pertenecer a varios si algún día hace falta.
- **Administrador (jefe):** rol global (plugin `admin` de Better Auth). Ve y opera sobre todos los departamentos y administra usuarios y catálogos.
- **Solo dos roles** en el MVP, definidos en el código: `agente` y `admin`. Los guards de NestJS los resuelven; nunca se resuelven dentro del service.
- El **departamento del ticket es un campo propio**, no se deduce de quien lo cargó. En la práctica coincide con el del creador, salvo cuando carga un admin.



### 4.2 Matriz de permisos


| Acción                             | Agente (ticket de su departamento)                               | Agente (ticket de otro departamento) | Admin                  |
| ---------------------------------- | ---------------------------------------------------------------- | ------------------------------------ | ---------------------- |
| Ver tickets                        | Sí                                                               | Sí, solo lectura                     | Sí                     |
| Crear ticket                       | Sí, solo en su departamento                                      | No                                   | Sí, en cualquiera      |
| Editar / cambiar estado / comentar | Sí                                                               | No                                   | Sí                     |
| Ver la lista                       | Filtrada por su departamento por defecto; puede quitar el filtro |                                      | Sin filtro por defecto |
| Gestionar usuarios y catálogos     | No                                                               | No                                   | Sí                     |


Razón: cada persona se dedica a lo suyo, pero puede ver el trabajo de los demás.

## 5. Alcance



### 5.1 Incluido en el MVP

- **Usuarios y accesos:** alta, edición, desactivación (soft delete) y reseteo de contraseña por el admin. No hay registro público.
- **Catálogos administrables desde la pantalla:** Áreas, Edificios, Proveedores, Tipos, Prioridades, Módulos y Estados.
- **Tickets:** creación y edición colaborativa dentro del departamento.
- **Comentarios / notas de seguimiento** dentro del ticket.
- **Bandeja de tickets** con búsqueda y filtros por estado, departamento, área, edificio, tipo, prioridad y texto.
- **Auditoría:** módulo genérico que registra cada cambio, con usuario y fecha.
- **Eliminación lógica** en todos los registros de negocio.



### 5.2 Fuera del alcance (Fase 2 o descartado)

- **Fase 2:** archivos adjuntos, exportar a CSV, campos personalizados creados desde la interfaz (ver 8.3), acceso de usuarios externos al área, asignación de tickets a agentes individuales.
- **Descartado (no tener en cuenta):** notificaciones por correo y migración de datos históricos desde Notion.



## 6. Ticket: modelo funcional



### 6.1 Campos


| Campo                         | Detalle                                                                                                                                                                                                                                                        |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                          | Identificador interno, técnico.                                                                                                                                                                                                                                |
| `numero`                      | Número interno correlativo **continuo**, sin año, con prefijo (ej. `TE-000013`). Se genera automáticamente.                                                                                                                                                    |
| `departamento`                | Relación con `Organization`. Define en qué bandeja aparece y quién puede editarlo.                                                                                                                                                                             |
| `area`, `edificio`            | Relaciones a los catálogos. Son **independientes**: se eligen por separado en cada ticket.                                                                                                                                                                     |
| `tipo`, `prioridad`, `modulo` | Relaciones a catálogos editables. `modulo` indica qué parte del sistema en desarrollo tiene el problema (interfaz pública, un módulo de área como comisiones, despacho o mesa de entradas, u otros).                                                           |
| `estado`                      | Relación al catálogo de Estados editable. Ver 6.2.                                                                                                                                                                                                             |
| `titulo`, `descripcion`       | Texto.                                                                                                                                                                                                                                                         |
| `actuacionSimple`             | Texto opcional, con la referencia de la nota interna.                                                                                                                                                                                                          |
| `proveedor`                   | Relación opcional al catálogo de Proveedores.                                                                                                                                                                                                                  |
| `referenciaExterna`           | Número de ticket que asigna el proveedor, formato `Número/año` (ej. `19092/2026`, el número es solo un ejemplo). Opcional, texto validado con ese formato. Único por proveedor. Vive en el ticket; el catálogo de Proveedores solo guarda datos del proveedor. |
| `fechaRecepcion`              | Fecha real en que llegó el requerimiento (puede ser anterior a la carga).                                                                                                                                                                                      |
| `fechaCierre`                 | Se completa al finalizar o cancelar.                                                                                                                                                                                                                           |
| `solucionDescripcion`         | Se documenta la solución al cerrar.                                                                                                                                                                                                                            |
| `notificado`                  | Casilla manual de validación visual: "se notificó al usuario".                                                                                                                                                                                                 |
| Auditoría                     | `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`.                                                                                                                                                                                               |




### 6.2 Estados

Los estados son un **catálogo editable** (tabla `EstadoTicket`), para poder agregarlos o modificarlos sin deploy. Valores iniciales sugeridos: `Pendiente`, `En progreso`, `En espera` (esperando al proveedor o al usuario), `Finalizado` y `Cancelado`.

Para que las reglas no dependan del nombre, cada estado tiene una **casilla "cerrado"**. Pasar a un estado marcado como cerrado completa `fechaCierre` y exige `solucionDescripcion`. El admin puede crear, renombrar, reordenar y marcar estados sin deploy.

### 6.3 Comentarios

Cada ticket tiene notas de seguimiento (texto, autor y fecha). Son inmutables y quedan en el historial.

### 6.4 Flujo operativo

1. El admin carga usuarios y catálogos.
2. Llega un requerimiento (Actuación Simple, correo o llamada).
3. Un agente crea el ticket en su departamento y completa área, edificio, tipo, módulo, prioridad y fecha de recepción.
4. Si interviene un proveedor, lo asocia y registra la referencia externa. El ticket pasa a `En espera` mientras aguarda respuesta.
5. El agente avanza los estados y agrega comentarios.
6. Al cerrar documenta la solución, marca `notificado` y el ticket pasa a `Finalizado`.
7. Cada cambio queda auditado automáticamente.



## 7. Stack tecnológico (decisión final)


| Capa                     | Elección                              | Nota                                                                                                    |
| ------------------------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Gestor de paquetes       | `pnpm` workspaces                     |                                                                                                         |
| Monorepo                 | Turborepo                             |                                                                                                         |
| Lenguaje                 | TypeScript `strict`, Node 22          |                                                                                                         |
| Backend                  | NestJS                                | Módulos, DI, guards.                                                                                    |
| Contratos de API         | **oRPC + Zod** (`packages/contracts`) | Ya cableado en el esqueleto; se expone como OpenAPI/REST. Reemplaza al "REST clásico" del PRD original. |
| Base de datos            | PostgreSQL 16+                        |                                                                                                         |
| ORM                      | Prisma 7.10 (versión fijada)          |                                                                                                         |
| Autenticación            | Better Auth                           | Plugins `organization` y `admin`.                                                                       |
| Frontend                 | Vite + React 19 (SPA)                 |                                                                                                         |
| Routing / datos / tablas | TanStack Router + Query + Table       |                                                                                                         |
| Formularios              | react-hook-form + Zod de `contracts`  |                                                                                                         |
| UI                       | Tailwind + shadcn/ui                  |                                                                                                         |
| Calidad                  | Biome                                 |                                                                                                         |
| Tests                    | Vitest                                | Las pruebas de extremo a extremo se hacen a mano por ahora.                                             |
| Infraestructura          | Docker Compose                        | Postgres + API + web (Nginx en producción).                                                             |
| CI                       | GitHub Actions con `turbo --filter`   |                                                                                                         |



## 8. Arquitectura



### 8.1 Reglas

1. **Contratos compartidos:** los esquemas Zod de `packages/contracts` son la fuente de verdad; cambiar un campo marca en el compilador todo lo afectado.
2. **Esquema por migraciones** de Prisma, no por un motor de entidades genérico.
3. **Un módulo por dominio** en la API, autocontenido. Controller/router → service → repository (solo el repository conoce Prisma). Permisos en guards.
4. **Web por feature:** `features/<dominio>` expone hooks; `routes/` solo compone.



### 8.2 Módulos

- **Transversales (garantizados):** `auth`, `organizations` (departamentos), `users`, `audit`.
- **De negocio:** `catalogs` (áreas, edificios, proveedores, tipos, prioridades, módulos, estados) y `tickets` (incluye comentarios).
- **Futuros:** cada nuevo dominio es un módulo nuevo que reutiliza auth, permisos y `audit`.



### 8.3 Modelo de datos

- **Better Auth (gestionado por la librería):** `User`, `Session`, `Account`, `Verification`, `Organization`, `Member`.
- **Catálogos:** `Area`, `Edificio`, `Proveedor` (nombre, contacto, teléfono, correo, sitio web), `TipoTicket`, `Prioridad`, `Modulo`, `EstadoTicket` (con casilla `cerrado`). Todos con nombre, orden y estado activo.
- **Operativo:** `Ticket`, `TicketComentario`.
- **Transversal:** `AuditLog` (`entityType`, `entityId`, `actorId`, `action`, `payload JSONB`, `createdAt`).
- **Campos de auditoría base** (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`) en las tablas propias del negocio. Las tablas de Better Auth no llevan esas columnas: sus cambios se registran con el módulo `audit`.
- **Las relaciones importantes son relaciones reales de Postgres**, nunca IDs dentro de JSONB.
- **Crecimiento de campos:** nivel 1 (habitual) es migración + contrato. Nivel 2 (campos creados por el admin sin deploy: tabla de definiciones + columna `customValues JSONB`, índices GIN) queda para Fase 2 y solo si hace falta. Nunca modelo EAV.



## 9. Infraestructura y despliegue

- `docker-compose.yml` levanta Postgres, API y web con un solo comando, en desarrollo y en el servidor.
- Producción: servidor Linux on-premise.
- Variables de entorno validadas con Zod al arrancar.
- Versiones exactas (sin `^`); nunca `latest` en dependencias en transición.



## 10. Etapas de desarrollo propuestas

Cada etapa se escribe como un SPEC en `specs/` antes de implementarse.


| #   | Etapa                                | Contenido                                                                                                                                                | Resultado verificable                                              |
| --- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 0   | **Esqueleto** (hecha, SPEC 01)       | Monorepo, Docker, CI, `health.check` de punta a punta.                                                                                                   | `docker compose up` levanta todo.                                  |
| 1   | **Autenticación y acceso** (SPEC 02) | Better Auth con `organization` y `admin`, migración inicial, admin raíz por seed, login/logout, guards, los 4 departamentos, alta y gestión de usuarios. | Un agente entra y solo opera en su departamento; el admin ve todo. |
| 2   | **Auditoría base**                   | Módulo `audit`, campos de auditoría y soft delete como convención reutilizable.                                                                          | Cada mutación deja registro.                                       |
| 3   | **Catálogos**                        | ABM de Áreas, Edificios, Proveedores, Tipos, Prioridades, Módulos y Estados, con pantallas de administración.                                            | El admin edita catálogos sin deploy.                               |
| 4   | **Tickets núcleo**                   | Creación y edición, numeración interna, estados, permisos por departamento, historial.                                                                   | Ciclo completo de un ticket.                                       |
| 5   | **Comentarios y bandeja**            | Comentarios, lista con búsqueda y filtros, vista de detalle.                                                                                             | Un agente encuentra y sigue tickets.                               |
| 6   | **Endurecimiento y despliegue**      | Backups de Postgres, despliegue on-premise, revisión de CI y pruebas manuales de permisos.                                                               | Sistema en el servidor real.                                       |
| —   | **Fase 2**                           | Adjuntos, exportar CSV, campos personalizados, asignación a individuos, otros módulos (inventario, notas, tareas).                                       |                                                                    |




## 11. Decisiones registradas y puntos abiertos



### 11.1 Decisiones cerradas

- **P1.** El número del proveedor tiene formato `Número/año`; `19092/2026` es solo un ejemplo. Vive en el ticket como `referenciaExterna`; el catálogo de Proveedores solo guarda datos del proveedor.
- **P2.** Los estados son un catálogo editable en base de datos, no una lista fija en código.
- **P3.** Sin Zustand. Playwright no se instala por ahora; el autor prueba a mano.
- **P4.** Las tablas de Better Auth se cubren con el módulo `audit`, sin columnas de auditoría propias.
- **P5.** Área y Edificio son independientes y se eligen por separado en cada ticket.
- **P6.** No hay auto-registro: solo el admin crea usuarios.
- **P7.** Sin derivación entre departamentos: cada agente crea tickets solo en el suyo.
- **P8.** Los estados llevan una casilla "cerrado" en lugar de categorías fijas.
- **P9.** El número interno es continuo, sin año, con prefijo (ej. `TE-000013`).
- **P10.** El proveedor lleva nombre, contacto, teléfono, correo y sitio web.
- **P11.** `referenciaExterna` nunca se repite: se valida como única por proveedor (los tickets eliminados lógicamente no cuentan).
- **P12.** `TE` es solo el prefijo fijo del número interno, que se genera automáticamente al crear el ticket (ej. `TE-000013`). No significa "ticket externo" ni identifica áreas: es el mismo para todos los tickets, tengan o no proveedor, con una única numeración continua.
