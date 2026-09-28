# Catálogo de specs de system-syc

> **Status:** Propuesta, pendiente de revisión
> **Date:** 2026-09-25
> **Fuentes:** `docs/prd.md` (v3), `docs/architecture.md`, `specs/01-esqueleto-monorepo.md`, `README.md`
> **Objetivo:** listado de specs técnicos y de negocio que sirva como contrato antes de escribir código. Cubre las etapas 1 a 6 del PRD §10 (SPEC 02 a 07).

## Cómo revisar este documento

- Cada **MUST** cita su fuente: `PRD §x`, `P#` (decisión cerrada del PRD §11.1) o `ARCH` (`docs/architecture.md`).
- *(propuesta técnica)*: no figura en los docs. Es una elección técnica, no una regla de negocio. Aprobala, cambiala o tachala.
- `[NEEDS CLARIFICATION Qn]`: regla de negocio que los docs no definen o contradicen. La pregunta exacta está en la sección **Preguntas abiertas**, al final, con un espacio para tu respuesta.
- Las preguntas que queden sin responder bloquean solo el SPEC al que pertenecen.



## Índice


| SPEC | Dominio                                        | Etapa PRD §10 |
| ---- | ---------------------------------------------- | ------------- |
| 01   | Dominio 0: Plataforma y convenciones (vigente) | 0             |
| 02   | Dominio 1: Autenticación y acceso              | 1             |
| 03   | Dominio 2: Auditoría y eliminación lógica      | 2             |
| 04   | Dominio 3: Catálogos                           | 3             |
| 05   | Dominio 4: Tickets núcleo                      | 4             |
| 06   | Dominio 5: Comentarios, bandeja y detalle      | 5             |
| 07   | Dominio 6: Endurecimiento y despliegue         | 6             |


---



## Dominio 0: Plataforma y convenciones transversales (SPEC 01, vigente)

**Feature:** Reglas de arquitectura para cualquier spec

- **MUST (Requisitos críticos):**
  - Los esquemas Zod de `packages/contracts` son la fuente de verdad. Cambiar un campo rompe el `typecheck` de api y web (ARCH regla 1).
  - Un módulo por dominio en la API: router oRPC → service → repository. Solo `*.repository.ts` importa `@syc/db` (PRD §8.1).
  - Los permisos se resuelven en guards, nunca en services (PRD §4.1, §8.1).
  - En la web, `features/<dominio>/hooks` envuelve el cliente oRPC y `routes/` solo compone (PRD §8.1).
  - Un campo nuevo es migración Prisma + contrato (nivel 1). Las relaciones importantes son FK reales, nunca IDs en JSONB (PRD §8.3).
  - Versiones exactas sin `^` y la versión mayor de Prisma fijada (PRD §9).
  - Variables de entorno validadas con Zod al arrancar, en api y web.
  - Un módulo nuevo no modifica los existentes; solo se registra en `app.module.ts` (PRD §1).
- **EDGE CASES:**
  - Env inválida: el proceso aborta con un mensaje que nombra la variable.
  - Postgres caído: `health.check` responde 200 con `degraded`/`down`.
  - `[NEEDS CLARIFICATION Q1]` SPEC 01 figura como aprobado y la etapa 0 como hecha, pero hay 9 de 14 criterios de aceptación sin tildar.
- **MUST NOT (Restricciones):** Drizzle, Directus/BaaS, Next.js, microservicios, colas, CQRS/event sourcing, MongoDB, EAV, motor de entidades dinámico, Zustand, Playwright (P3). Tampoco importar el cliente oRPC desde `routes/` o `components/`.

---



## Dominio 1: Autenticación y acceso (SPEC 02)

**Feature 1.1:** Login, logout y sesión

- **MUST:**
  - Better Auth con email/credenciales. Solo entran usuarios creados por el admin (P6).
  - El endpoint público de sign-up está deshabilitado (PRD §5.1).
  - Las rutas `_authenticated/*` redirigen a `/login` si no hay sesión (ARCH).
  - Todo procedimiento de dominio exige sesión (`AuthGuard`); solo `health.check` y los endpoints de auth son públicos *(propuesta técnica)*.
  - Un usuario desactivado no puede iniciar sesión (PRD §5.1).
- **EDGE CASES:**
  - Credenciales inválidas: mensaje genérico que no revela si el usuario existe *(propuesta técnica)*.
  - Sesión expirada en medio del uso: 401 y redirección a login *(propuesta técnica)*.
  - `[NEEDS CLARIFICATION Q2]` Identificador de login.
  - `[NEEDS CLARIFICATION Q3]` Política de contraseña y duración de sesión.
- **MUST NOT:** registro público, login social, recuperación de contraseña por correo (los correos están descartados, PRD §5.2).

**Feature 1.2:** Admin raíz y departamentos por seed

- **MUST:**
  - Un seed idempotente crea el admin raíz con rol global `admin` y los 4 departamentos: Administrativo, Técnico, Redes y Desarrollo (PRD §10, etapa 1).
  - Las credenciales del admin raíz salen de variables de entorno validadas con Zod *(propuesta técnica)*.
- **EDGE CASES:**
  - Correr el seed dos veces no duplica nada.
  - Si faltan las variables del admin, el seed aborta con un mensaje claro.
- **MUST NOT:** credenciales hardcodeadas ni commiteadas.

**Feature 1.3:** Departamentos

- **MUST:**
  - Departamento = `Organization` de Better Auth. No existe una tabla `Departamento` (PRD §4.1).
  - El agente pertenece a su departamento vía `Member` con rol `agente`.
- **EDGE CASES:**
  - `[NEEDS CLARIFICATION Q5]` ¿Se administran desde la UI?
  - `[NEEDS CLARIFICATION Q6]` Multi-departamento en el MVP.
  - `[NEEDS CLARIFICATION Q7]` Agente sin departamento.
- **MUST NOT:** tabla propia de departamentos; derivar tickets entre departamentos (P7).

**Feature 1.4:** Gestión de usuarios (admin)

- **MUST:**
  - Solo el admin da de alta, edita, desactiva y resetea contraseñas (PRD §5.1).
  - El alta asigna rol (`agente` | `admin`) y departamento. Hay solo dos roles y están definidos en código (PRD §4.1).
  - Toda operación sobre usuarios y membresías queda auditada (P4, una vez que exista SPEC 03).
- **EDGE CASES:**
  - Email duplicado: error de validación.
  - `[NEEDS CLARIFICATION Q4]` Mecanismo de desactivación.
  - `[NEEDS CLARIFICATION Q8]` Reseteo de contraseña.
  - `[NEEDS CLARIFICATION Q9]` Departamento del admin y protección del último admin.
- **MUST NOT:** que un agente gestione usuarios; el borrado físico de usuarios (PRD §5.1).

**Feature 1.5:** Autorización (guards y matriz PRD §4.2)

- **MUST:**
  - `AuthGuard`, `PermissionsGuard`, `@RequirePermission()` y `@CurrentUser()` (ARCH).
  - Agente: ve tickets de todos los departamentos; crea solo en el suyo; edita, cambia estado y comenta solo tickets de su departamento.
  - Admin: todo, en todos los departamentos, más usuarios y catálogos.
  - El permiso se evalúa contra `ticket.departamento`, nunca contra `createdBy` (PRD §4.1).
  - La barrera real está en el backend; la UI solo oculta acciones *(propuesta técnica)*.
- **EDGE CASES:**
  - Un agente manipula el payload para crear en otro departamento: 403.
  - Un agente muta un ticket ajeno: 403 y nada cambia.
  - Cambio de rol o departamento con la sesión abierta: los permisos se reevalúan en la siguiente request *(propuesta técnica)*.
- **MUST NOT:** permisos dentro de services; roles adicionales en el MVP.
- **Verificable:** un agente entra y solo opera en su departamento; el admin ve todo.

---



## Dominio 2: Auditoría y eliminación lógica (SPEC 03)

**Feature 2.1:** Módulo `audit`

- **MUST:**
  - Servicio inyectable `audit.log(entityType, entityId, action, payload)` (ARCH).
  - Tabla `AuditLog` con `entityType`, `entityId`, `actorId`, `action`, `payload JSONB` y `createdAt` (PRD §8.3).
  - Toda mutación de negocio y de tablas de Better Auth deja registro con usuario y fecha (PRD §5.1, P4).
  - El registro va en la misma transacción que la mutación: si falla la auditoría, falla la mutación *(propuesta técnica)*.
  - Es append-only: la API no ofrece update ni delete *(propuesta técnica)*.
  - Los módulos futuros lo reutilizan sin modificarlo.
- **EDGE CASES:**
  - Una edición sin cambios efectivos no genera registro *(propuesta técnica)*.
  - En acciones del seed o del sistema, `actorId` es nulo con `action` identificable *(propuesta técnica)*.
  - `[NEEDS CLARIFICATION Q10]` Contenido del payload y eventos de sesión.
  - `[NEEDS CLARIFICATION Q11]` Quién ve la auditoría.
- **MUST NOT:** guardar contraseñas, hashes o tokens en el payload; EAV.

**Feature 2.2:** Campos de auditoría base

- **MUST:**
  - `createdAt`, `updatedAt`, `createdBy`, `updatedBy` y `deletedAt` en catálogos, `Ticket` y `TicketComentario` (PRD §8.3).
  - Los carga el backend desde la sesión, nunca desde el payload del cliente.
- **MUST NOT:** agregar esas columnas a las tablas de Better Auth (P4).

**Feature 2.3:** Eliminación lógica

- **MUST:**
  - Eliminar un registro de negocio es setear `deletedAt`; no hay `DELETE` físico (PRD §5.1).
  - Las consultas excluyen eliminados por defecto.
  - La eliminación queda auditada.
- **EDGE CASES:**
  - Eliminar algo ya eliminado devuelve 404 *(propuesta técnica)*.
  - `[NEEDS CLARIFICATION Q12]` Restaurar y ver eliminados.
  - `[NEEDS CLARIFICATION Q13]` Eliminar un ítem en uso.
- **MUST NOT:** borrado físico ni cascadas físicas.

---



## Dominio 3: Catálogos (SPEC 04)

**Feature 3.1:** ABM de Área, Edificio, TipoTicket, Prioridad y Modulo

- **MUST:**
  - Un modelo Prisma por catálogo, cada uno con `nombre`, `orden`, `activo` y los campos de auditoría base (PRD §8.3).
  - Solo el admin crea, edita, reordena, desactiva y elimina (PRD §4.2). Cualquier usuario autenticado puede leer *(propuesta técnica, lo necesitan los formularios)*.
  - Hay pantallas de administración y los cambios no requieren deploy (PRD §10, etapa 3).
  - Los selectores del ticket muestran solo ítems activos, ordenados por `orden`.
- **EDGE CASES:**
  - Nombre vacío o solo espacios: se rechaza (trim) *(propuesta técnica)*.
  - Empate de `orden`: desempata por nombre *(propuesta técnica)*.
  - `[NEEDS CLARIFICATION Q14]` Unicidad de nombres.
  - `[NEEDS CLARIFICATION Q15]` Catálogos globales o por departamento.
  - `[NEEDS CLARIFICATION Q13]` Diferencia entre desactivar y eliminar.
- **MUST NOT:** una tabla genérica de catálogos con discriminador; EAV; que un agente edite catálogos.

**Feature 3.2:** Proveedores

- **MUST:**
  - Campos `nombre`, `contacto`, `telefono`, `correo` y `sitioWeb`, más orden y activo (P10).
  - El catálogo no guarda referencias externas (P1).
- **EDGE CASES:** `[NEEDS CLARIFICATION Q16]` Campos obligatorios y validaciones.
- **MUST NOT:** guardar en el catálogo números de ticket del proveedor.

**Feature 3.3:** Estados (`EstadoTicket`)

- **MUST:**
  - Es un catálogo en la base (P2). El admin crea, renombra, reordena y marca `cerrado` sin deploy (PRD §6.2).
  - Las reglas dependen de `cerrado`, nunca del nombre (P8).
  - El seed carga Pendiente, En progreso, En espera, Finalizado (cerrado) y Cancelado (cerrado) (PRD §6.2, §6.1 `fechaCierre`).
- **EDGE CASES:**
  - `[NEEDS CLARIFICATION Q17]` Estado inicial de un ticket nuevo.
  - `[NEEDS CLARIFICATION Q18]` Invariantes del catálogo.
- **MUST NOT:** un enum de estados en código; categorías fijas; lógica del tipo `if (nombre === "Finalizado")`.

---



## Dominio 4: Tickets núcleo (SPEC 05)

**Feature 4.1:** Creación

- **MUST:**
  - Un agente crea solo en su departamento; el backend lo valida. El admin elige cualquier departamento (PRD §4.2, P7).
  - Campos según PRD §6.1. Área y edificio son independientes (P5). `proveedor` y `actuacionSimple` son opcionales.
  - Las relaciones apuntan a ítems de catálogo activos.
  - El `numero` se genera en el servidor (feature 4.2). `createdBy` sale de la sesión. La creación queda auditada.
  - El formulario usa el mismo Zod de `contracts` con react-hook-form (ARCH).
- **EDGE CASES:**
  - Un ítem de catálogo inexistente, inactivo o eliminado: 400.
  - El contrato de entrada no acepta `numero`, `createdBy` ni `fechaCierre` *(propuesta técnica)*.
  - `[NEEDS CLARIFICATION Q19]` Campos obligatorios y largos.
  - `[NEEDS CLARIFICATION Q20]` `fechaRecepcion`.
- **MUST NOT:** deducir el departamento del creador cuando carga un admin (PRD §4.1); adjuntos, campos personalizados o asignación a individuos (Fase 2).

**Feature 4.2:** Numeración interna

- **MUST:**
  - Formato `TE-000013`: prefijo fijo `TE` para todos los tickets y una única secuencia continua sin año (P9, P12).
  - La genera el servidor, es inmutable y única, y nunca se reutiliza (un ticket eliminado conserva su número).
- **EDGE CASES:**
  - Creaciones concurrentes nunca producen el mismo número: generación atómica más constraint único.
  - `[NEEDS CLARIFICATION Q21]` Huecos y desborde.
- **MUST NOT:** numerar por departamento, año o proveedor; que el prefijo codifique algo (P12); que el usuario edite el número.

**Feature 4.3:** Edición colaborativa

- **MUST:**
  - Editan el admin y los agentes del departamento del ticket (PRD §4.2).
  - Cada edición actualiza `updatedAt`/`updatedBy` y queda auditada.
- **EDGE CASES:**
  - `[NEEDS CLARIFICATION Q22]` Ediciones concurrentes.
  - `[NEEDS CLARIFICATION Q23]` Tickets cerrados.
  - `[NEEDS CLARIFICATION Q24]` El admin cambia el departamento.
- **MUST NOT:** editar `numero`, `createdAt` ni `createdBy`.

**Feature 4.4:** Cambio de estado y cierre

- **MUST:**
  - Pasar a un estado con `cerrado` completa `fechaCierre` y exige `solucionDescripcion` no vacía (PRD §6.2).
  - Cada cambio de estado queda auditado con estado anterior, estado nuevo, usuario y fecha.
  - `notificado` es una casilla manual (PRD §6.1).
- **EDGE CASES:**
  - Cierre sin `solucionDescripcion`: 400 y el estado no cambia.
  - `[NEEDS CLARIFICATION Q25]` Transiciones y reapertura.
  - `[NEEDS CLARIFICATION Q26]` `fechaCierre`.
  - `[NEEDS CLARIFICATION Q27]` `notificado`.
  - `[NEEDS CLARIFICATION Q28]` "En espera".
- **MUST NOT:** lógica que dependa del nombre del estado; notificaciones por correo (descartadas).

**Feature 4.5:** Proveedor y referencia externa

- **MUST:**
  - `proveedor` es opcional.
  - `referenciaExterna` es opcional, con formato `Número/año` validado en Zod (P1).
  - Es única por proveedor, sin contar tickets eliminados (P11). Se implementa con un índice único parcial *(propuesta técnica)*.
- **EDGE CASES:**
  - Duplicado con el mismo proveedor: 409 con un mensaje que nombra el ticket existente *(propuesta técnica)*.
  - Mismo número con otro proveedor: permitido.
  - Eliminar el ticket libera la referencia.
  - `[NEEDS CLARIFICATION Q29]` Formato exacto y referencia sin proveedor.
  - `[NEEDS CLARIFICATION Q30]` Cambio o quita del proveedor.
- **MUST NOT:** guardar la referencia en el catálogo de Proveedores (P1).

**Feature 4.6:** Historial del ticket

- **MUST:** se lee desde `AuditLog` (`entityType = Ticket`) y muestra usuario y fecha de cada cambio (PRD §10, etapa 4).
- **EDGE CASES:** visibilidad según Q11.
- **MUST NOT:** una tabla de historial propia de tickets que duplique `audit`.

**Feature 4.7:** Eliminación de ticket

- **MUST:** eliminación lógica y auditada. El número no se reutiliza y la `referenciaExterna` queda libre.
- **EDGE CASES:** `[NEEDS CLARIFICATION Q31]` La matriz PRD §4.2 no tiene la acción "eliminar".
- **MUST NOT:** `DELETE` físico.

---



## Dominio 5: Comentarios, bandeja y detalle (SPEC 06)

**Feature 5.1:** Comentarios

- **MUST:**
  - Cada comentario tiene texto, autor (de la sesión) y fecha. Son inmutables y quedan en el historial (PRD §6.3).
  - Comentan el admin y los agentes del departamento del ticket. Lee cualquiera que pueda ver el ticket (PRD §4.2).
- **EDGE CASES:**
  - Texto vacío o solo espacios: 400. El largo máximo va en el contrato *(propuesta técnica)*.
  - Comentar tickets cerrados: ver Q23.
  - `[NEEDS CLARIFICATION Q32]` Inmutable frente a soft delete universal.
- **MUST NOT:** editar comentarios; adjuntos; menciones o notificaciones.

**Feature 5.2:** Bandeja

- **MUST:**
  - Búsqueda y filtros por estado, departamento, área, edificio, tipo, prioridad y texto (PRD §5.1).
  - El agente la ve filtrada por su departamento por defecto y puede quitar el filtro. El admin la ve sin filtro (PRD §4.2).
  - Excluye tickets eliminados.
  - TanStack Table con paginación, filtros y orden resueltos en el servidor; los filtros se combinan con AND *(propuesta técnica)*.
- **EDGE CASES:**
  - Sin resultados: estado vacío.
  - En el texto libre se escapan `%` y `_`.
  - Se puede filtrar por ítems de catálogo inactivos, para encontrar tickets históricos *(propuesta técnica)*.
  - `[NEEDS CLARIFICATION Q33]` Campos del texto libre.
  - `[NEEDS CLARIFICATION Q34]` Orden y paginación por defecto.
  - `[NEEDS CLARIFICATION Q35]` Filtros adicionales.
- **MUST NOT:** exportar CSV; filtrar por agente asignado (Fase 2).

**Feature 5.3:** Detalle del ticket

- **MUST:**
  - Muestra campos, comentarios e historial.
  - Las acciones aparecen solo si hay permiso; un agente de otro departamento ve el ticket en solo lectura (PRD §4.2).
  - Ruta `/tickets/$id` (ARCH).
- **EDGE CASES:** un ticket inexistente o eliminado devuelve 404.
- **MUST NOT:** que `routes/` llame directamente al cliente oRPC.

---



## Dominio 6: Endurecimiento y despliegue (SPEC 07)

**Feature 6.1:** Backups de Postgres

- **MUST:** backups automáticos (PRD §10, etapa 6).
- **EDGE CASES:** `[NEEDS CLARIFICATION Q36]` Política de backups.
- **MUST NOT:** depender de backups manuales.

**Feature 6.2:** Despliegue on-premise

- **MUST:**
  - Servidor Linux con Docker Compose y Nginx sirviendo la web (PRD §7, §9).
  - Dockerfiles de producción (diferidos desde SPEC 01).
  - Migraciones con `prisma migrate deploy` *(propuesta técnica)*.
  - Env validadas al arrancar.
- **EDGE CASES:**
  - Si una migración falla, la API no arranca *(propuesta técnica)*.
  - `[NEEDS CLARIFICATION Q37]` HTTPS y forma de deploy.
- **MUST NOT:** orquestadores distintos de Docker Compose.

**Feature 6.3:** CI y pruebas de permisos

- **MUST:**
  - CI en verde con `turbo --filter`.
  - Tests Vitest de services con el repository mockeado.
  - Checklist manual que recorre cada celda de la matriz PRD §4.2 antes de salir a producción (PRD §7, P3).
- **MUST NOT:** Playwright (P3).

---



## Fuera de alcance del MVP (MUST NOT global)

- **Fase 2:** adjuntos, exportar CSV, campos personalizados (nivel 2, JSONB), usuarios externos, asignación a individuos, inventario, notas y tareas.
- **Descartado:** notificaciones por correo y migración de datos desde Notion.

---



## Preguntas abiertas

Escribí tu respuesta debajo de cada pregunta, en la línea **Respuesta:**. Si una queda vacía, se mantiene como `[NEEDS CLARIFICATION]` y bloquea solo su SPEC.

### SPEC 01

**Q1.** SPEC 01 está "Approved" y la etapa 0 "hecha", pero 9 de sus 14 criterios de aceptación siguen sin tildar. ¿Están pendientes de verificar o ya se cumplen y falta marcarlos?
**Respuesta:**

### SPEC 02: Autenticación y acceso

**Q2.** ¿El login es con email + contraseña o con nombre de usuario?
**Respuesta:** Nombre de usuario + contraseña. falta el plugin username.

**Q3.** ¿Qué política de contraseña hay (largo mínimo, complejidad)? ¿Cuánto dura una sesión? ¿Hay "recordarme"?
**Respuesta:** Largo mínimo 8, máximo 128, sin complejidad; sesión de 12 horas con renovación diaria; sin casilla "recordarme"

**Q4.** El PRD §5.1 pide desactivar usuarios por soft delete, pero P4 dice que las tablas de Better Auth no llevan `deletedAt`. ¿Desactivar equivale al `ban` del plugin `admin`? ¿Cierra de inmediato las sesiones abiertas? ¿Se puede reactivar al usuario?
**Respuesta:** Desactivar es el ban del plugin admin, sin vencimiento. Cierra las sesiones al instante y el usuario no puede volver a entrar. Se reactiva con unban. No se agrega deletedAt a las tablas de Better Auth y no hay borrado físico. El usuario desactivado sigue visible para el admin y como autor en el historial.

**Q5.** ¿Los 4 departamentos son fijos (seed) o el admin puede crearlos, renombrarlos o desactivarlos desde la UI?
**Respuesta:** ABM completo, como los catálogos. Amplía SPEC 02 con reglas que el PRD no tiene: qué pasa con los tickets y con los agentes de un departamento desactivado.

**Q6.** ¿El MVP permite que un usuario esté en varios departamentos? Si es así, ¿en cuál crea tickets y cuál es su filtro por defecto?
**Respuesta:** Un solo departamento por agente. El admin se lo asigna en el alta. Crea ahí y la bandeja arranca filtrada por ese. El esquema sigue pudiendo tener varios miembros en el futuro; el MVP no lo ofrece. Pertenecer a varios queda fuera del MVP.

**Q7.** ¿Puede existir un agente sin departamento? Si es así, ¿qué puede hacer?
**Respuesta:** Un agente no puede existir sin departamento. El alta y la edición exigen exactamente uno. Si el cambio lo dejaría sin departamento, se rechaza.

**Q8.** En el reseteo de contraseña, ¿el admin escribe la nueva o el sistema genera una temporal? ¿Se obliga a cambiarla en el primer ingreso? ¿El usuario puede cambiar su propia contraseña?
**Respuesta:** El admin escribe la contraseña en el alta y en el reseteo (entre 8 y 128 caracteres). No hay clave temporal ni obligación de cambiarla al primer ingreso. El usuario puede cambiar la suya si conoce la actual. El reseteo del admin no pide la contraseña anterior.

**Q9.** ¿El admin pertenece a algún departamento? ¿Se impide desactivar o degradar al último admin activo, o a uno mismo?
**Respuesta:** El admin no pertenece a ningún departamento. El departamento es obligatorio solo para el rol agente. No se puede desactivar ni degradar al último admin activo, ni a uno mismo. Al degradar a otro admin hay que asignarle un departamento en esa misma acción.

### SPEC 03: Auditoría y eliminación lógica

**Q10.** ¿El `payload` de auditoría guarda un diff (antes/después por campo) o un snapshot completo? ¿Se auditan logins, logouts e intentos fallidos?
**Respuesta:** El payload guarda un diff: por cada campo modificado, el valor anterior y el nuevo. En un alta se guarda la acción create con los valores iniciales. No se auditan logins, logouts ni intentos fallidos. Nunca se guardan contraseñas, hashes ni tokens.

**Q11.** ¿Quién ve el historial? ¿Cualquiera que pueda ver el ticket, incluso de otro departamento? ¿El MVP tiene una pantalla de auditoría global para el admin?
**Respuesta:** Igual que la anterior, más una pantalla global solo para el admin. Ahí se ve quién desactivó a un usuario o quién editó un catálogo. Amplía el MVP con filtros y paginación que ninguna etapa pide.

**Q12.** ¿Se pueden restaurar registros eliminados? ¿El admin puede listar los eliminados?
**Respuesta:**

**Q13.** Los catálogos tienen `activo` y `deletedAt`. ¿Qué diferencia hay entre desactivar y eliminar? ¿Se puede eliminar un ítem que usan tickets existentes?
**Respuesta:**

### SPEC 04: Catálogos

**Q14.** ¿El nombre es único dentro de cada catálogo? ¿La comparación distingue mayúsculas y acentos?
**Respuesta:**

**Q15.** ¿Los catálogos son globales o alguno es por departamento (por ejemplo, Módulos solo para Desarrollo)?
**Respuesta:**

**Q16.** En Proveedor, ¿qué campos son obligatorios? ¿Se valida el formato de correo y URL? ¿El teléfono es texto libre?
**Respuesta:**

**Q17.** ¿Con qué estado nace un ticket? ¿Hay una casilla "inicial" en `EstadoTicket`, se usa el primero por `orden` o lo elige el usuario?
**Respuesta:**

**Q18.** ¿Debe existir siempre al menos un estado abierto y uno cerrado? ¿Se puede desactivar un estado en uso? Si se cambia `cerrado` en un estado con tickets, ¿se recalcula algo en esos tickets?
**Respuesta:**

### SPEC 05: Tickets núcleo

**Q19.** ¿Qué campos son obligatorios al crear? ¿Título, descripción, área, edificio, tipo, módulo, prioridad y fecha de recepción? ¿Qué largo máximo tienen título y descripción?
**Respuesta:**

**Q20.** ¿`fechaRecepcion` es fecha o fecha-hora? ¿Puede ser futura? ¿Por defecto es hoy?
**Respuesta:**

**Q21.** ¿"Continuo" exige que no haya huecos (una creación fallida no consume número) o se tolera algún hueco? ¿Qué pasa después de `TE-999999`?
**Respuesta:**

**Q22.** Si dos agentes editan el mismo ticket a la vez, ¿gana el último o se rechaza la segunda edición (bloqueo optimista)?
**Respuesta:**

**Q23.** ¿Un ticket en estado cerrado se puede editar? ¿Y comentar?
**Respuesta:**

**Q24.** ¿El admin puede cambiar el departamento de un ticket existente?
**Respuesta:**

**Q25.** ¿Se puede pasar libremente de cualquier estado a cualquier otro? ¿Se permite reabrir un ticket cerrado? En ese caso, ¿se borra `fechaCierre` y se conserva `solucionDescripcion`? Al pasar de un cerrado a otro cerrado, ¿se recalcula `fechaCierre`?
**Respuesta:**

**Q26.** ¿`fechaCierre` se completa sola con el momento del cambio o el usuario la puede editar (como `fechaRecepcion`)?
**Respuesta:**

**Q27.** ¿`notificado` es obligatorio para cerrar o solo informativo?
**Respuesta:**

**Q28.** Paso 4 del flujo (PRD §6.4): cuando se asocia un proveedor, ¿el ticket pasa solo a "En espera" o el agente lo cambia a mano?
**Respuesta:**

**Q29.** ¿Se puede cargar `referenciaExterna` sin proveedor? Formato exacto: ¿el número lleva solo dígitos? ¿El año tiene 4 dígitos y algún rango válido? ¿`019092/2026` es lo mismo que `19092/2026`?
**Respuesta:**

**Q30.** Si se quita o cambia el proveedor de un ticket, ¿la `referenciaExterna` se borra, se conserva o hay que volver a cargarla?
**Respuesta:**

**Q31.** La matriz PRD §4.2 no incluye "eliminar". ¿Quién puede eliminar un ticket: un agente de su departamento o solo el admin?
**Respuesta:**

### SPEC 06: Comentarios, bandeja y detalle

**Q32.** Los comentarios son inmutables (PRD §6.3), pero todo registro de negocio tiene soft delete (PRD §5.1). ¿Un comentario se puede eliminar? ¿Quién puede?
**Respuesta:**

**Q33.** ¿En qué campos busca el texto libre? ¿Título, descripción, número, referencia externa, actuación simple, comentarios?
**Respuesta:**

**Q34.** ¿Cuál es el orden por defecto de la bandeja (número, fecha de recepción, última actualización) y cuántos tickets muestra por página?
**Respuesta:**

**Q35.** Proveedor, módulo, abiertos/cerrados, rango de fechas y `notificado` no están en la lista de filtros del PRD §5.1. ¿Se agregan o quedan fuera a propósito?
**Respuesta:**

### SPEC 07: Endurecimiento y despliegue

**Q36.** Backups: ¿con qué frecuencia, cuánta retención, a qué destino? ¿Hay que probar la restauración?
**Respuesta:**

**Q37.** Despliegue: ¿HTTPS con certificado interno? ¿Qué dominio o hostname? ¿El deploy es manual en el servidor o lo dispara el CI?
**Respuesta:**

### Entrega

**Q38.** ¿Querés dejar este catálogo como único archivo, o que cada dominio se convierta en su propio SPEC (02 a 07) con la plantilla de SPEC 01? Recomendación: un archivo por SPEC, porque cada uno se implementa y verifica por separado.
**Respuesta:**

---



## Próximos pasos tras tus respuestas

1. Cada `[NEEDS CLARIFICATION]` resuelto pasa a MUST, MUST NOT o EDGE, con la fuente "decisión del usuario, fecha". Las que sigan abiertas quedan marcadas.
2. Se crean los archivos definitivos en `specs/` según Q38. No se toca código fuente.
3. Se propone registrar las decisiones nuevas en `docs/prd.md` §11.1 como P13 en adelante (con aprobación aparte, porque el PRD es la fuente de verdad del producto).

