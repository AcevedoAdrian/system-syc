# Catálogo de specs de system-syc — índice

> **Status:** Resuelto — ver SPEC 02 a 07
> **Date:** 2026-09-25, resuelto 2026-09-29
> **Fuentes:** `docs/prd.md` (v3), `docs/architecture.md`, `specs/01-esqueleto-monorepo.md`, `README.md`

Este documento fue la propuesta inicial de specs, con preguntas abiertas. Todas las preguntas (Q1 a Q38) ya fueron respondidas y, donde hacía falta, resueltas con decisiones adicionales (D1 a D4) por conflictos entre respuestas o con la implementación. El contrato definitivo de cada dominio vive en su propio SPEC. Este archivo queda como registro de las preguntas, respuestas y decisiones que originaron esos SPEC.

## Índice

| SPEC | Dominio | Archivo | Etapa PRD §10 |
|---|---|---|---|
| 01 | Plataforma y convenciones (vigente) | `specs/01-esqueleto-monorepo.md` | 0 |
| 02 | Autenticación y acceso | `specs/02-autenticacion-acceso.md` | 1 |
| 03 | Auditoría y eliminación lógica | `specs/03-auditoria-soft-delete.md` | 2 |
| 04 | Catálogos | `specs/04-catalogos.md` | 3 |
| 05 | Tickets núcleo | `specs/05-tickets-nucleo.md` | 4 |
| 06 | Comentarios, bandeja y detalle | `specs/06-comentarios-bandeja.md` | 5 |
| 07 | Endurecimiento y despliegue | `specs/07-endurecimiento-despliegue.md` | 6 |

## Decisiones que resolvieron conflictos entre respuestas (2026-09-29)

Cuatro respuestas del catálogo, tomadas juntas, se contradecían entre sí o con la implementación. Se resolvieron con AskUserQuestion antes de escribir los SPEC definitivos:

| # | Conflicto | Decisión | Dónde vive |
|---|---|---|---|
| D1 | Sin casilla `cerrado`, las reglas de `fechaCierre`/`fechaReabierto` dependerían del *nombre* del estado, pero el admin puede renombrar estados (Q18). | Los 4 estados de sistema (Finalizado, Cerrado, Cancelado, Reabierto) llevan una `clave` interna fija, invisible para el admin. Las reglas usan la `clave`, no el nombre. Esos estados no se pueden eliminar. | SPEC 04 Feature 4.3, SPEC 05 Feature 5.4 |
| D2 | Eliminar un departamento borra físicamente `Organization` (Q5), pero un ticket eliminado lógicamente (Q12) puede seguir apuntando a él por FK. | Un departamento solo se elimina si nunca tuvo tickets (ni eliminados) ni agentes. Si tiene historia, solo se desactiva. | SPEC 02 Feature 2.3 |
| D3 | Q33 decía que la búsqueda de texto distingue mayúsculas y acentos, al revés de la unicidad de catálogos (Q14). | La búsqueda de texto **no** distingue mayúsculas ni acentos, igual que Q14. Se resolvió con la extensión `unaccent` de Postgres (`lower(unaccent(texto))`), sin columnas normalizadas: no guarda datos derivados. | SPEC 06 Feature 6.2 |
| D4 | El login es por usuario (Q2), pero `User` de Better Auth exige email único. | El email es opcional en el alta; si falta, se guarda `<usuario>@syc.local`, sin uso funcional. | SPEC 02, modelo de datos |

## Cambios pendientes en `docs/prd.md`

Varias respuestas reinterpretan el PRD original. Se están volcando a `docs/prd.md` (versión 4) en el mismo cambio que este catálogo. Ver el detalle en cada SPEC, sección "Decisiones".

## Preguntas y respuestas (registro histórico)

Las respuestas completas, tal como las escribió el usuario el 2026-09-29, y su resolución:

### SPEC 01

**Q1.** SPEC 01 está "Approved" y la etapa 0 "hecha", pero 9 de sus 14 criterios de aceptación siguen sin tildar. ¿Están pendientes de verificar o ya se cumplen y falta marcarlos?
**Respuesta:** Está pendiente de verificar.
**Resuelto:** no bloquea los SPEC 02 a 07; queda como tarea de verificación de SPEC 01, sin re-abrir su alcance.

### SPEC 02: Autenticación y acceso → `specs/02-autenticacion-acceso.md`

- **Q2** (login por usuario, plugin `username`), **Q3** (contraseña 8–128, sesión 12h renovada a diario, sin "recordarme"), **Q4** (desactivar = `ban` del plugin admin, sin vencimiento, cierra sesiones, `unban` reactiva), **Q5** (ABM de departamentos por el admin, eliminar solo sin historia — ver D2), **Q6** (un agente, un solo departamento), **Q7** (agente sin departamento no puede existir), **Q8** (admin fija/resetea contraseñas, usuario cambia la propia con la actual), **Q9** (admin sin departamento, protección del último admin).
- Todas resueltas → Feature 2.1 a 2.5 de SPEC 02.

### SPEC 03: Auditoría y eliminación lógica → `specs/03-auditoria-soft-delete.md`

- **Q10** (payload = diff, sin auditar sesión), **Q11** (historial visible a quien ve la entidad, sin pantalla global), **Q12** (sin restaurar, sin listar eliminados), **Q13** (desactivar ≠ eliminar; eliminar en uso se rechaza).
- Todas resueltas → Feature 3.1 a 3.4 de SPEC 03.

### SPEC 04: Catálogos → `specs/04-catalogos.md`

- **Q14** (nombre único normalizado por catálogo), **Q15** (catálogos globales), **Q16** (Proveedor: solo nombre obligatorio, se valida email/URL, teléfono libre), **Q17** (estado inicial = primero activo por orden, ver D1), **Q18** (siempre un estado activo; renombrar no recalcula nada).
- Todas resueltas → Feature 4.1 a 4.3 de SPEC 04.

### SPEC 05: Tickets núcleo → `specs/05-tickets-nucleo.md`

- **Q19** (obligatorios: título, departamento, prioridad, fecha de recepción; área/edificio/tipo/módulo fuera del alta), **Q20** (fechaRecepcion sin hora, no futura), **Q21** (huecos tolerados, sin límite tras TE-999999), **Q22** (bloqueo optimista por `updatedAt`, 409), **Q23** (se editan y comentan tickets cerrados), **Q24** (solo el admin cambia el departamento), **Q25** (transición libre entre estados; ver D1 para fechaCierre/fechaReabierto), **Q26** (fechaCierre no se completa sola), **Q27** (`notificado` informativo), **Q28** (asociar proveedor no cambia el estado), **Q29** (referenciaExterna exige proveedor, formato número/año, se normalizan ceros), **Q30** (quitar proveedor borra la referencia), **Q31** (solo el admin elimina tickets).
- Todas resueltas → Feature 5.1 a 5.7 de SPEC 05.

### SPEC 06: Comentarios, bandeja y detalle → `specs/06-comentarios-bandeja.md`

- **Q32** (comentarios inmutables, solo el admin los elimina), **Q33** (texto libre sobre título/descripción/solución/comentarios — corregido por D3 para que no distinga mayúsculas ni acentos), **Q34** (orden por fecha de recepción desc, 20 por página), **Q35** (se agregan filtros de proveedor, módulo y rango de fecha de recepción).
- Todas resueltas → Feature 6.1 a 6.3 de SPEC 06.

### SPEC 07: Endurecimiento y despliegue → `specs/07-endurecimiento-despliegue.md`

- **Q36** (backup diario 02:00, 30 copias locales, prueba de restauración antes de producción), **Q37** (HTTP por IP sin dominio, deploy manual, CI no despliega).
- Todas resueltas → Feature 7.1 a 7.3 de SPEC 07.

### Entrega

**Q38.** ¿Único archivo o un SPEC por dominio?
**Respuesta:** Un archivo por SPEC, del 02 al 07, con la plantilla de SPEC 01.
**Resuelto:** este archivo pasó a índice; los SPEC 02 a 07 son los archivos definitivos.
