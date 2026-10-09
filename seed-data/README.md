# seed-data

Datos iniciales que carga `pnpm --filter @syc/api seed` (`apps/api/src/seed.ts`). Son archivos JSON
que el seed lee al correr; no forman parte del código.

| Archivo | Contenido | ¿Obligatorio? | En git |
| --- | --- | --- | --- |
| `departamentos.json` | Nombres de los departamentos | sí | sí |
| `estados.json` | `{ nombre, clave? }`; la `clave` es la de los 4 estados de sistema | sí | sí |
| `prioridades.json` | Nombres | sí | sí |
| `edificios.json` | Nombres | no | sí |
| `areas.json` | Nombres | no | **no** (`.gitignore`) |
| `agentes.json` | `{ nombre, apellido, departamento }` | no | **no** (`.gitignore`) |

- El orden del archivo es el `orden` del catálogo.
- Un archivo opcional que no existe se saltea y el seed lo avisa. `areas.example.json` y
  `agentes.example.json` muestran el formato: copialos como `areas.json` y `agentes.json` y
  completalos. En el servidor de producción esos dos se copian a mano a `seed-data/`.
- Los agentes se crean con el usuario `<primera letra del nombre><apellido>` (sin acentos) y la
  contraseña de `SEED_AGENTS_PASSWORD`; el `departamento` tiene que ser uno de `departamentos.json`.
- El seed busca la carpeta subiendo desde el directorio actual, o usa `SEED_DATA_DIR` si está definida
  (en producción es `/seed-data`, montada desde esta carpeta).
