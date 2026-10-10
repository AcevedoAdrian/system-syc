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
| `areas.json` | `{ tipo, nombre }`; el `tipo` es uno de `tipos-area.json` | no | **no** (`.gitignore`) |
| `agentes.json` | `{ nombre, apellido, departamento }` | no | **no** (`.gitignore`) |

- El orden del archivo es el `orden` del catálogo. Los tipos de área se cargan antes que las áreas.
- Cada área nombra su `tipo`, que se busca por nombre sin mayúsculas ni acentos. Si un tipo no existe,
  o dos áreas repiten el nombre dentro de un mismo tipo, el seed aborta nombrando los valores y no crea
  áreas. Un catálogo (tipos o áreas) solo se carga si su tabla está vacía: en una base con áreas ya
  cargadas (por ejemplo después de la migración `tipos_area`, que las deja todas en «Otro») el seed no
  las toca.
- Un archivo opcional que no existe se saltea y el seed lo avisa. `areas.example.json` y
  `agentes.example.json` muestran el formato: copialos como `areas.json` y `agentes.json` y
  completalos. En el servidor de producción esos dos se copian a mano a `seed-data/`.
- Los agentes se crean con el usuario `<primera letra del nombre><apellido>` (sin acentos) y la
  contraseña de `SEED_AGENTS_PASSWORD`; el `departamento` tiene que ser uno de `departamentos.json`.
- El seed busca la carpeta subiendo desde el directorio actual, o usa `SEED_DATA_DIR` si está definida
  (en producción es `/seed-data`, montada desde esta carpeta).
