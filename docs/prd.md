# PRD — Sistema de Gestión Interna y Seguimiento de Tickets

**Autor:** Adrián Hugo Acevedo
**Versión:** 6
**Fecha:** 29 de septiembre de 2026
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

- **Departamento =** `Organization` **de Better Auth** (Administrativo, Técnico, Redes, Desarrollo). No existe una tabla `Departamento` aparte. El admin los administra desde la UI: crear, renombrar, desactivar/reactivar y eliminar (solo si hoy no tiene agentes asignados ni tickets, ni siquiera eliminados; si no, se desactiva).
- Un **agente pertenece exactamente a un departamento** (`Member` con rol `agente`); no puede quedar sin uno. El modelo permite pertenecer a varios a futuro; el MVP no lo ofrece.
- **Administrador (jefe):** rol global (plugin `admin` de Better Auth), **sin departamento propio**. Ve y opera sobre todos los departamentos y administra usuarios, departamentos y catálogos. No se puede desactivar ni degradar al último admin activo, ni a uno mismo; degradar a un admin a `agente` exige asignarle un departamento en la misma acción.
- **Solo dos roles** en el MVP, definidos en el código: `agente` y `admin`. Los guards de NestJS los resuelven; nunca se resuelven dentro del service.
- El **departamento del ticket es un campo propio**, no se deduce de quien lo cargó. En la práctica coincide con el del creador, salvo cuando carga un admin. Solo el admin puede cambiar el departamento de un ticket existente.
- El login es por **nombre de usuario** (plugin `username` de Better Auth), no por email; el email queda opcional y sin uso funcional.



### 4.2 Matriz de permisos


| Acción                              | Agente (ticket de su departamento) | Agente (ticket de otro departamento) | Admin             |
| ----------------------------------- | ----------------------------------- | ------------------------------------- | ----------------- |
| Ver tickets                         | Sí                                  | No                                     | Sí                 |
| Crear ticket                        | Sí, solo en su departamento         | No                                     | Sí, en cualquiera  |
| Editar / cambiar estado / comentar  | Sí                                  | No                                     | Sí                 |
| Ver la lista                        | Siempre acotada a su departamento   |                                        | Sin filtro         |
| Eliminar ticket                     | No                                  | No                                     | Sí                 |
| Eliminar comentario                 | No                                  | No                                     | Sí                 |
| Cambiar el departamento de un ticket| No                                  | No                                     | Sí                 |
| Gestionar usuarios, departamentos y catálogos | No                        | No                                     | Sí                 |


Razón: cada agente ve y opera solo en su departamento, sin poder quitar ese límite. El admin ve todos.

Un agente que pide por URL un ticket de otro departamento recibe el mismo "no existe" (404) que por un número inexistente, para no revelar qué tickets hay en otros departamentos. Crear un ticket en otro departamento sí es un rechazo explícito (403).

## 5. Alcance



### 5.1 Incluido en el MVP

- **Usuarios y accesos:** alta, edición, desactivación (`ban` sin vencimiento, no `deletedAt`) y reseteo de contraseña por el admin. No hay registro público.
- **Departamentos administrables desde la pantalla:** crear, renombrar, desactivar/reactivar y eliminar (solo si hoy no tiene agentes ni tickets).
- **Catálogos administrables desde la pantalla:** Áreas, Edificios, Proveedores, Tipos, Prioridades, Módulos y Estados. Prioridades, igual que Estados, siempre conserva al menos un ítem activo, y arranca con Baja, Media, Alta y Urgente.
- **Tickets:** creación y edición colaborativa dentro del departamento.
- **Comentarios / notas de seguimiento** dentro del ticket, inmutables; solo el admin los elimina.
- **Bandeja de tickets**, siempre acotada al departamento del agente, con búsqueda y filtros por estado, área, edificio, tipo, prioridad, proveedor, módulo, rango de fecha de recepción y texto.
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
| `fechaRecepcion`              | Fecha real en que llegó el requerimiento (puede ser anterior a la carga). Fecha sin hora; no puede ser futura. Se puede corregir después, con la misma regla (hoy o anterior).                                                                                                                                                 |
| `fechaCierre`                 | Obligatoria al pasar a un estado de cierre (ver 6.2). La carga quien cambia el estado, no se completa sola; fecha sin hora, no futura. Se conserva al pasar entre estados de cierre, y quien guarda puede corregirla. Cargada, se puede corregir al editar el ticket (hoy o anterior); no se puede borrar ni cargar por esa vía: solo al cambiar de estado.                                          |
| `fechaReabierto`              | Obligatoria al pasar a un estado de reapertura (ver 6.2). Misma regla que `fechaCierre`: la carga quien cambia el estado, fecha sin hora, no futura. Al reabrir, `fechaCierre` y `solucionDescripcion` ya cargadas se conservan. Igual que `fechaCierre`: se corrige al editar, y se carga solo al cambiar de estado.                              |
| `solucionDescripcion`         | Opcional. Texto de la solución, si se documenta. No es obligatoria para cerrar. Se edita en cualquier momento, también con el ticket cerrado.                                                                                                                                                                                |
| `notificado`                  | Casilla manual de validación visual: "se notificó al usuario".                                                                                                                                                                                                 |
| Auditoría                     | `createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`.                                                                                                                                                                                               |




### 6.2 Estados

Los estados son un **catálogo editable** (tabla `EstadoTicket`), para poder agregarlos o modificarlos sin deploy. Valores iniciales: `Pendiente`, `En progreso`, `En espera` (esperando al proveedor o al usuario), `Finalizado`, `Cerrado`, `Cancelado` y `Reabierto`. Cada uno tiene nombre, orden y estado activo. No hay casilla "cerrado" ni casilla "inicial" visibles para el admin.

Un ticket nuevo nace en el primer estado activo según el orden. Con los valores iniciales, es `Pendiente`. El formulario de alta no pregunta el estado.

**Los cuatro estados de sistema** (`Finalizado`, `Cerrado`, `Cancelado`, `Reabierto`) llevan una **clave interna fija** (`FINALIZADO`, `CERRADO`, `CANCELADO`, `REABIERTO`) que el admin no ve ni edita; el resto de los estados no tiene clave. Todas las reglas de este documento y del código se resuelven contra esa clave, **nunca contra el nombre**: el admin puede renombrar libremente "Finalizado" a "Resuelto" sin que la regla deje de aplicarse. Los estados con clave se pueden renombrar, reordenar y desactivar, pero **no se pueden eliminar** — un módulo de negocio depende de que existan.

Pasar a un estado con clave `FINALIZADO`, `CERRADO` o `CANCELADO` exige `fechaCierre` en esa misma acción; `solucionDescripcion` no es obligatoria. Pasar a un estado con clave `REABIERTO` exige `fechaReabierto`; `fechaCierre` y `solucionDescripcion` ya cargadas se conservan. Al pasar de un estado de cierre a otro estado de cierre, `fechaCierre` se conserva y quien guarda la puede corregir; no se recalcula sola. Se puede pasar libremente de cualquier estado activo a cualquier otro: no hay una máquina de transiciones restringida.

Siempre queda al menos un estado activo. No se puede desactivar ni eliminar el último. Un estado que ya usan tickets se puede desactivar: deja de ofrecerse al cambiar de estado y los tickets lo siguen mostrando. Si se desactiva el primero del orden, los tickets nuevos nacen en el siguiente activo. Eliminar un estado sin clave solo es posible si ningún ticket no eliminado lo usa; un estado con clave nunca se puede eliminar, esté o no en uso.

El admin puede crear, renombrar y reordenar estados sin deploy. La comparación de nombres (para la unicidad del catálogo) no distingue mayúsculas ni acentos.

### 6.3 Comentarios

Cada ticket tiene notas de seguimiento (texto, autor y fecha). Son inmutables. El historial del ticket muestra que hubo un comentario (quién y cuándo, agregado o eliminado), sin su texto: si el admin lo elimina, el texto no reaparece.

### 6.4 Flujo operativo

1. El admin carga usuarios, departamentos y catálogos.
2. Llega un requerimiento (Actuación Simple, correo o llamada).
3. Un agente crea el ticket en su departamento con título, prioridad y fecha de recepción (`descripcion` y `actuacionSimple` opcionales). El estado queda en el primero del catálogo. Área, edificio, tipo y módulo quedan sin asignar hasta que se completan en una edición posterior.
4. Si interviene un proveedor, el agente lo asocia y registra la referencia externa cuando corresponda; eso no cambia el estado por sí solo. El agente pasa el ticket a `En espera` (u otro estado) a mano, si corresponde.
5. El agente avanza los estados y agrega comentarios; también puede completar área, edificio, tipo y módulo en cualquier edición.
6. Al pasar a un estado de cierre (`Finalizado`, `Cerrado` o `Cancelado`) carga la fecha de cierre. La solución es opcional. `notificado` sigue siendo una casilla manual, en cualquier momento. Un ticket cerrado se puede reabrir (`Reabierto`, con su propia fecha) y se lo puede seguir editando y comentando.
7. Solo el admin elimina un ticket o le cambia el departamento; solo el admin elimina un comentario.
8. Cada cambio queda auditado automáticamente.

Cambiar el estado o el departamento se hace desde diálogos aparte; el formulario de edición no los incluye, y no se puede cambiar el estado mientras haya cambios sin guardar en él.



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

- **Better Auth (gestionado por la librería):** `User`, `Session`, `Account`, `Verification`, `Organization`, `Member`, y las que generan sus plugins aunque el MVP no las use directamente: `Invitation` (plugin `organization`) y `RateLimit` (límite de intentos del login). `Organization` lleva además el campo propio `activo` (departamento desactivado).
- **Catálogos:** `Area`, `Edificio`, `Proveedor` (nombre, contacto, teléfono, correo, sitio web), `TipoTicket`, `Prioridad`, `Modulo`, `EstadoTicket`. Todos con nombre, orden y estado activo. `EstadoTicket` no tiene casilla `cerrado` ni `inicial`; en su lugar, cuatro estados de sistema (`Finalizado`, `Cerrado`, `Cancelado`, `Reabierto`) llevan una clave interna fija que el admin no edita (ver 6.2). `Prioridad` sigue la misma regla de "siempre queda al menos un ítem activo": no se puede desactivar ni eliminar la última activa. Valores iniciales: `Baja`, `Media`, `Alta` y `Urgente`.
- **Operativo:** `Ticket`, `TicketComentario`.
- **Transversal:** `AuditLog` (`entityType`, `entityId`, `actorId`, `action`, `payload JSONB`, `createdAt`).
- **Campos de auditoría base** (`createdAt`, `updatedAt`, `createdBy`, `updatedBy`, `deletedAt`) en las tablas propias del negocio. Las tablas de Better Auth no llevan esas columnas: sus cambios se registran con el módulo `audit`.
- **Las relaciones importantes son relaciones reales de Postgres**, nunca IDs dentro de JSONB.
- **Crecimiento de campos:** nivel 1 (habitual) es migración + contrato. Nivel 2 (campos creados por el admin sin deploy: tabla de definiciones + columna `customValues JSONB`, índices GIN) queda para Fase 2 y solo si hace falta. Nunca modelo EAV.



## 9. Infraestructura y despliegue

- `docker-compose.yml` levanta Postgres, API y web con un solo comando, en desarrollo.
- Producción: servidor Linux on-premise, con `docker-compose.prod.yml`: Postgres, un servicio que aplica las migraciones, la API, la web servida por Nginx (única entrada HTTP, la API va bajo `/api` en el mismo origen) y un contenedor de backup. Procedimiento en `docs/despliegue.md`.
- Backups: copia diaria de Postgres a las 02:00 (hora de Argentina) en una carpeta del servidor, con rotación de 30. Quedan en el mismo servidor que la base: es una limitación aceptada.
- Se despliega por tags `vAAAA.MM.DD` sobre `main`, con un backup manual antes de cada deploy. Sin HTTPS ni dominio propio (HTTP por IP en la red interna).
- Los permisos de la matriz §4.2 se comprueban a mano contra el servidor con `docs/checklist-permisos.md`.
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



## 11. Decisiones registradas

El detalle completo de cada decisión, con sus edge cases y su contrato técnico, vive en el SPEC correspondiente (`specs/02-*.md` a `specs/07-*.md`). Esta sección deja el resumen de producto.

### 11.1 Decisiones cerradas

- **P1.** El número del proveedor tiene formato `Número/año`; `19092/2026` es solo un ejemplo. Vive en el ticket como `referenciaExterna`; el catálogo de Proveedores solo guarda datos del proveedor. Exige proveedor cargado; el año va entre 2000 y 2100; los ceros a la izquierda del número se normalizan al guardar.
- **P2.** Los estados son un catálogo editable en base de datos, no una lista fija en código.
- **P3.** Sin Zustand. Playwright no se instala por ahora; el autor prueba a mano.
- **P4.** Las tablas de Better Auth se cubren con el módulo `audit`, sin columnas de auditoría propias. `Organization.activo` es la única excepción (no es una columna de auditoría).
- **P5.** Área y Edificio son independientes y se eligen por separado en cada ticket; ninguno es obligatorio en el alta.
- **P6.** No hay auto-registro: solo el admin crea usuarios.
- **P7.** Sin derivación entre departamentos: cada agente crea y ve tickets solo en el suyo, sin poder quitar ese límite.
- **P8.** *(reemplazada, 2026-09-29)* Los estados no llevan una casilla visible "cerrado"; los cuatro estados de sistema llevan una clave interna fija que el admin no edita, para que renombrarlos no rompa las reglas de cierre y reapertura (ver 6.2).
- **P9.** El número interno es continuo, sin año, con prefijo (ej. `TE-000013`). Se toleran huecos si una creación falla; no se reutiliza.
- **P10.** El proveedor lleva nombre (único, obligatorio), contacto, teléfono, correo y sitio web (los cuatro últimos opcionales, con validación de formato en correo y sitio web).
- **P11.** `referenciaExterna` nunca se repite: se valida como única por proveedor (los tickets eliminados lógicamente no cuentan).
- **P12.** `TE` es solo el prefijo fijo del número interno, que se genera automáticamente al crear el ticket (ej. `TE-000013`). No significa "ticket externo" ni identifica áreas: es el mismo para todos los tickets, tengan o no proveedor, con una única numeración continua.
- **P13.** Login por nombre de usuario (plugin `username`), no por email; el email queda opcional y sin uso funcional.
- **P14.** Desactivar un usuario es el `ban` del plugin `admin`, sin vencimiento; cierra sesiones activas de inmediato; se reactiva con `unban`. No hay borrado físico.
- **P15.** Un agente pertenece exactamente a un departamento; no puede quedar sin uno. El admin no pertenece a ningún departamento y no se puede desactivar ni degradar al último admin activo, ni a uno mismo.
- **P16.** El admin administra departamentos desde la UI (crear, renombrar, desactivar/reactivar, eliminar); eliminar solo si el departamento hoy no tiene agentes asignados (activos o desactivados) ni tickets, ni siquiera eliminados.
- **P17.** Un agente no ve, ni puede llegar por URL directa, a un ticket de otro departamento; el límite no se puede quitar. El admin ve todos, sin filtro por defecto.
- **P18.** Solo el admin elimina un ticket, elimina un comentario o cambia el departamento de un ticket existente. Los comentarios son inmutables: no se editan.
- **P19.** El alta de un ticket solo exige título, departamento (implícito para el agente), prioridad y fecha de recepción; área, edificio, tipo y módulo quedan sin asignar hasta una edición posterior. El estado nace en el primero activo del catálogo y no se pregunta en el alta.
- **P20.** Asociar o cambiar un proveedor no cambia el estado del ticket por sí solo. `notificado` es siempre informativa, nunca obligatoria para cerrar.
- **P21.** Ediciones simultáneas sobre el mismo ticket usan bloqueo optimista por `updatedAt`: la segunda en llegar se rechaza con 409.
- **P22.** `Prioridad` siempre conserva al menos un ítem activo (igual que Estados), porque el alta de un ticket exige elegir una. Arranca con `Baja`, `Media`, `Alta` y `Urgente`; el resto de los catálogos (Áreas, Edificios, Tipos, Módulos, Proveedores) arranca vacío y lo carga el admin.

### 11.2 Puntos que quedaron fuera del MVP a propósito

- Restaurar o listar registros eliminados lógicamente.
- Pantalla de auditoría global (el historial por ticket sí existe).
- Auditoría de eventos de sesión (login, logout, intentos fallidos).
- HTTPS, dominio propio y CI/CD automático de despliegue (se retoma en una etapa futura).


