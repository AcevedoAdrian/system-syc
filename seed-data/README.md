# seed-data

Datos iniciales que carga `pnpm --filter @syc/api seed` (`apps/api/src/seed.ts`). Son archivos JSON
que el seed lee al correr; no forman parte del código.

| Archivo | Contenido | ¿Obligatorio? | En git |
| --- | --- | --- | --- |
| `departamentos.json` | Nombres de los departamentos | sí | sí |
| `estados.json` | `{ nombre, clave? }`; la `clave` es la de los 4 estados de sistema | sí | sí |
| `prioridades.json` | Nombres | sí | sí |
| `edificios.json` | Nombres | no | sí |
| `tipos-area.json` | Nombres de los tipos de área (Diputado, Dirección…) | no | sí |
| `tipos-ticket.json` | `{ nombre, descripcion? }`; la descripción (hasta 500) es la ayuda que se ve al elegir el tipo en el alta | no | sí |
| `areas.json` | `{ tipo, nombre }`; el `tipo` es uno de `tipos-area.json` | no | **no** (`.gitignore`) |
| `modulos.json` | `{ nombre, departamentos }`; `departamentos` es una lista de uno o más de `departamentos.json` | no | sí |
| `agentes.json` | `{ nombre, apellido, departamento }` | no | **no** (`.gitignore`) |

- El orden del archivo es el `orden` del catálogo. Los tipos de área se cargan antes que las áreas.
- Cada área nombra su `tipo`, que se busca por nombre sin mayúsculas ni acentos. Si un tipo no existe,
  o dos áreas repiten el nombre dentro de un mismo tipo, el seed aborta nombrando los valores y no crea
  áreas. Un catálogo (tipos o áreas) solo se carga si su tabla está vacía: en una base con áreas ya
  cargadas (por ejemplo después de la migración `tipos_area`, que las deja todas en «Otro») el seed no
  las toca.
- Los tipos de ticket se cargan solo si la tabla `tipo_ticket` está vacía (eliminados incluidos), con su
  descripción en el `AuditLog`. Si dos tipos repiten el nombre (sin mayúsculas ni acentos), el seed
  aborta nombrándolos y no crea tipos. En una base con tipos ya cargados el seed no los toca, ni
  completa ni actualiza su descripción: eso se hace desde Catálogos → Tipos de ticket.
- Cada módulo nombra los `departamentos` a los que pertenece (uno o más), que se buscan por nombre sin
  mayúsculas ni acentos. Si un departamento no existe, un módulo trae la lista vacía o dos módulos
  repiten el nombre, el seed aborta nombrando los valores y no crea módulos. Se carga después de los
  departamentos y solo si la tabla `modulo` está vacía: en una base con módulos ya cargados el seed no
  los toca, así que no les asigna departamentos (eso se hace desde Catálogos → Módulos). Un departamento
  que se cree después empieza sin módulos.
- Un archivo opcional que no existe se saltea y el seed lo avisa. `areas.example.json` y
  `agentes.example.json` muestran el formato: copialos como `areas.json` y `agentes.json` y
  completalos. En el servidor de producción esos dos se copian a mano a `seed-data/`.
- Los agentes se crean con el usuario `<primera letra del nombre><apellido>` (sin acentos) y la
  una contraseña aleatoria propia (distinta para cada uno) que el seed imprime una sola vez al terminar;
  el `departamento` tiene que ser uno de `departamentos.json`.
- El seed busca la carpeta subiendo desde el directorio actual, o usa `SEED_DATA_DIR` si está definida
  (en producción es `/seed-data`, montada desde esta carpeta).
