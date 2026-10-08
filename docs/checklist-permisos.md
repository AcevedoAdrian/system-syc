# Checklist de permisos

Recorre la matriz de permisos del PRD §4.2 (`docs/prd.md`) sobre tickets y comentarios reales, **a mano, por la interfaz**, contra la `PUBLIC_URL` del servidor (SPEC 07, Feature 7.6). No hay e2e automatizado (P3): las reglas del servidor las cubre `pnpm verify`; este checklist comprueba que la interfaz y el despliegue real las respetan.

La corrida contra el servidor se commitea (con su línea en el registro) antes de dar la etapa por cerrada.

## Precondiciones

Armalas desde la UI como admin antes de empezar:

1. **El admin** del seed.
2. **Dos departamentos, A y B.** Sirven dos de los cuatro del seed (por ejemplo A = Técnico y B = Redes).
3. **El agente `a1`** en A (`/admin/usuarios`, rol Agente, departamento A). Anotá su contraseña.
4. **Un ticket TA en A**, con **un comentario**.
5. **Un ticket TB en B** (lo crea el admin).

Anotá el número de TA y de TB (por ejemplo `TE-000001` y `TE-000002`) y el `id` de cada uno: es el último tramo de la URL `/tickets/<id>` al abrirlos.

## Cómo se usa

Entrá con el usuario que indica cada bloque y hacé la acción de la columna **Acción**. Marcá **Resultado** con ✅ si pasó lo de **Esperado**, o con ❌ si no, y anotá en **Observaciones** lo que viste. Una fila en ❌ es un bug de permisos: no se cierra la etapa hasta arreglarlo y repetir la corrida.

## 1. Agente `a1`, ticket de su departamento (TA)

Entrá como `a1`.

| # | Acción | Esperado | Resultado | Observaciones |
|---|---|---|---|---|
| 1.1 | Abrir `/tickets` | Aparece TA. | | |
| 1.2 | Abrir `/tickets/<id de TA>` | Se ve el detalle de TA y su comentario. | | |
| 1.3 | Ir a `/tickets/nuevo` | El departamento aparece fijo (el de `a1`), sin selector. Crear un ticket lo deja en A. | | |
| 1.4 | En TA, cambiar un dato (por ejemplo el título) y «Guardar cambios» | Se guarda. | | |
| 1.5 | En TA, «Cambiar estado» y elegir otro | El estado de TA cambia. | | |
| 1.6 | En TA, escribir un comentario y «Comentar» | El comentario aparece al final. | | |
| 1.7 | Mirar la lista `/tickets` | Solo hay tickets de A: ninguno de B. | | |
| 1.8 | Mirar los filtros de `/tickets` | **No** hay filtro «Departamento». | | |
| 1.9 | En TA, buscar el botón «Eliminar» (ticket) | No se ve. | | |
| 1.10 | En el comentario de TA, buscar «Eliminar» | No se ve. | | |
| 1.11 | En TA, buscar «Cambiar departamento» | No se ve. | | |
| 1.12 | Mirar la barra lateral | No hay «Administración» (ni Departamentos, Catálogos o Usuarios). | | |
| 1.13 | Escribir en la barra `/admin/usuarios` (y probar `/admin/departamentos` y `/admin/catalogos`) | Vuelve a `/tickets`; no se ve ninguna pantalla de administración. | | |

## 2. Agente `a1`, ticket de otro departamento (TB)

Sigue como `a1`.

| # | Acción | Esperado | Resultado | Observaciones |
|---|---|---|---|---|
| 2.1 | Abrir `/tickets/<id de TB>` | «El ticket no existe.» (404): el mismo mensaje que con un id inexistente. | | |
| 2.2 | Abrir `/tickets/00000000-0000-0000-0000-000000000000` y comparar con 2.1 | Idéntico a 2.1: no revela que TB existe. | | |
| 2.3 | En `/tickets`, buscar con el cuadro de búsqueda una palabra del título de TB | TB no aparece. | | |
| 2.4 | En `/tickets/nuevo`, intentar crear un ticket en B | No se puede: el departamento es fijo (A) y no hay forma de elegir B. | | |
| 2.5 | Con 2.1: editar, cambiar el estado o comentar TB | No hay nada que operar: solo está el mensaje de que no existe. | | |
| 2.6 | Con 2.1: eliminar TB, eliminar su comentario o cambiar su departamento | No hay nada que operar: solo está el mensaje de que no existe. | | |

## 3. Administrador

Salí de `a1` y entrá como admin.

| # | Acción | Esperado | Resultado | Observaciones |
|---|---|---|---|---|
| 3.1 | Abrir `/tickets` | Aparecen TA y TB. | | |
| 3.2 | Abrir `/tickets/<id de TB>` | Se ve el detalle de TB. | | |
| 3.3 | Ir a `/tickets/nuevo` | El departamento es un selector con los 4 departamentos. Crear uno en B funciona. | | |
| 3.4 | En TA y en TB, editar un dato, «Cambiar estado» y comentar | Las tres acciones funcionan en los dos tickets. | | |
| 3.5 | Mirar los filtros de `/tickets` y filtrar por «Departamento» = A | Hay filtro «Departamento»; la lista muestra solo A. Quitar el filtro vuelve a mostrar todos. | | |
| 3.6 | En TA, «Cambiar departamento» → B | TA pasa a B. Volverlo a A. | | |
| 3.7 | En el comentario de TA, «Eliminar» | El comentario desaparece. | | |
| 3.8 | Crear un ticket de prueba y «Eliminar» | El ticket desaparece de la lista. | | |
| 3.9 | Mirar la barra lateral | Se ve «Administración» con Departamentos, Catálogos y Usuarios, y las tres pantallas abren. | | |

## 4. Después de cambiar de departamento

Prueba que el permiso sigue al departamento *actual* del ticket. Como admin, cambiá TA a B (3.6) y dejalo así. Entrá como `a1`.

| # | Acción | Esperado | Resultado | Observaciones |
|---|---|---|---|---|
| 4.1 | Abrir `/tickets/<id de TA>` | «El ticket no existe.» (TA ya es de B). | | |
| 4.2 | Mirar `/tickets` | TA ya no aparece. | | |

Al terminar, volvé TA a A como admin.

## Registro de corridas

Una línea por corrida. La de cierre de la etapa es la que se hace contra el servidor real.

| Fecha | Tag | Quién | Contra | Resultado |
|---|---|---|---|---|
| | | | | |

- **Fecha:** `AAAA-MM-DD`.
- **Tag:** el desplegado (`git describe --tags` en el servidor).
- **Contra:** la `PUBLIC_URL` donde se corrió.
- **Resultado:** «Todas ✅», o las filas en ❌ y qué se hizo.
