# Plan: correcciones de la revisión de UI de tickets (Web Interface Guidelines)

## Contexto

La revisión de `apps/web/src/features/tickets/components/` contra las Web Interface Guidelines de Vercel encontró cuatro problemas graves:

- ids duplicados entre el diálogo de estado y el formulario,
- cambios sin guardar que se pierden al navegar,
- una etiqueta sin control,
- botones «Eliminar» ambiguos.

También encontró fallas de accesibilidad en formularios, de tipografía y de feedback. Este plan las corrige en una rama propia, paso a paso. El alcance acordado es todo menos la sección «menores», que queda fuera: los dos links por fila, la paginación con `Link`, la variante de «Eliminar» del ticket y el `aria-describedby` de los botones deshabilitados.

**Ritmo acordado:** por cada paso,
1. implementar,
2. correr las verificaciones,
3. hacer commit,
4. mostrar el diff y **esperar el OK** antes del paso siguiente.

## Paso 0: rama y preparación

- `git switch -c ui-tickets-guidelines main`. `new-skill` no tiene commits propios. Los archivos sin commitear de la skill (`skills-lock.json`, `.agents/skills/…`, `.claude/skills/…`) viajan sin tocarse y **no se incluyen** en ningún commit.
- `pnpm install`: falta el `node_modules` de la raíz y los symlinks de `apps/web/node_modules` están rotos.
- Copiar este plan a `plans/ui-tickets-guidelines.md`. Primer commit.

## Paso 1: ids duplicados en `ChangeStatusDialog`

- `ChangeStatusDialog.tsx`: renombrar los ids `fechaCierre`, `fechaReabierto` y `solucionDescripcion` a `estado-fechaCierre`, `estado-fechaReabierto` y `estado-solucion`, en el `Label htmlFor` y en el control. `estadoId` ya es único.
- Test nuevo en `ChangeStatusDialog.test.tsx`: renderizar al lado un `<input id="fechaCierre">` con su label (como hace `TicketForm`), elegir un estado de cierre y comprobar que `getByLabelText("Fecha de cierre")` es el control **dentro** del diálogo.
- Los tests existentes usan `getByLabelText` con el texto: no cambian.

## Paso 2: aviso de cambios sin guardar en `TicketDetail`

- `TicketDetail.tsx`: usar `useBlocker` de `@tanstack/react-router` 1.170 con:
  - `shouldBlockFn: () => dirty && !leaving.current`
  - `enableBeforeUnload: dirty`
  - `withResolver: true`
- `leaving` es un `useRef`. Se activa en `confirmRemove` antes del `navigate`, para que eliminar no quede bloqueado.
- Con `status === "blocked"`, mostrar `ConfirmDialog` (`components/common/ConfirmDialog.tsx`, se reutiliza):
  - título «Descartar cambios»,
  - descripción «Hay cambios sin guardar en el ticket. Si salís, se pierden.»,
  - `confirmLabel` «Salir sin guardar».
  - Confirmar llama a `proceed`; cerrar llama a `reset`.
- Antes de escribir el código, verificar la firma exacta en `node_modules/@tanstack/react-router/dist/esm/useBlocker.d.ts`.
- `TicketDetail.test.tsx`: el mock de `@tanstack/react-router` (línea 35) suma `useBlocker`. Tests:
  - con `dirty` se pasa `shouldBlockFn` y devuelve `true`,
  - el diálogo bloqueado llama a `proceed` o `reset`.

## Paso 3: etiqueta del departamento y botones «Eliminar» de comentarios

- `CreateTicketForm.tsx:133`: para el agente, reemplazar el `<p id="departamentoId">` por `<Input id="departamentoId" value={ownDepartment?.nombre ?? ""} readOnly />`, que sí es etiquetable. Revisar `CreateTicketForm.test.tsx`: si busca el nombre con `getByText`, pasarlo a `getByLabelText("Departamento")` con `toHaveValue`.
- `TicketComments.tsx:88`: agregar `aria-label={`Eliminar comentario de ${comment.autor.nombre}`}`.
- `TicketComments.test.tsx` (líneas 168, 175, 183, 196, 209): los botones de fila se buscan por `/Eliminar comentario/`. El botón del diálogo sigue siendo «Eliminar» (líneas 187 y 211).

## Paso 4: `Field` compartido (errores asociados, obligatorios y ayudas)

- Nuevo `features/tickets/components/Field.tsx`, que reemplaza las dos copias de `Field` (`TicketForm.tsx:48` y `CreateTicketForm.tsx:32`).
  - Props: `id`, `label`, `error?`, `hint?` y `required?`.
  - `children` es una función que recibe `{ "aria-invalid"?, "aria-describedby"?, "aria-required"? }`.
  - Renderiza el error con `id={`${id}-error`}` y la ayuda con `id={`${id}-hint`}`.
  - La marca de obligatorio es `<span aria-hidden className="text-destructive">*</span>`, **fuera** del `<Label>`: así `getByLabelText("Título")` sigue funcionando.
- Aplicar en:
  - `TicketForm`, `CreateTicketForm` y `ChangeStatusDialog` (sus tres bloques armados a mano),
  - `ChangeDepartmentDialog`,
  - el textarea de `TicketComments`, a mano con `id="comentario-texto-error"`.
- `CatalogOptionSelect` y `DepartmentSelect` ya aceptan `invalid`. Agregarles `aria-describedby` como prop opcional que va al `SelectTrigger`.
- Obligatorios: `Título`, `Prioridad` y `Departamento` (en el alta, cuando lo elige el admin) llevan `required`.
- `referenciaExterna` deshabilitada: `hint="Elegí un proveedor para cargar la referencia."` cuando no hay proveedor.
- Inputs de texto que no son de autenticación llevan `autoComplete="off"`: título, actuación simple, referencia y el buscador de `TicketsFilters.tsx:156`.
- Placeholders terminados en «…»:
  - `TicketsFilters.tsx:161`: «Título, descripción, solución o comentarios…»
  - `TicketComments.tsx:110`: «Escribí un comentario…»
- `CreateTicketForm.tsx:146`: `autoFocus` solo con puntero fino. Usar un guard que no rompa en jsdom: `typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches`.
- Tests:
  - `aria-describedby` apunta al mensaje de error en `TicketForm` y en `CreateTicketForm`,
  - la ayuda de la referencia aparece sin proveedor.

## Paso 5: estado de envío y «Recargar» robusto

- Texto del botón mientras `isSubmitting`/`pending`:

  | Componente | Botón | Texto durante el envío |
  |---|---|---|
  | `TicketForm` | Guardar cambios | Guardando… |
  | `CreateTicketForm` | Crear ticket | Creando… |
  | `TicketComments` | Comentar | Comentando… |
  | `ChangeStatusDialog` | Cambiar estado | Cambiando… |
  | `ChangeDepartmentDialog` | Cambiar departamento | Cambiando… |

- `ChangeStatusDialog.tsx:187` y `ChangeDepartmentDialog.tsx:86`: el «Recargar» lleva estado `reloading` (botón deshabilitado) y `try/catch`. Si falla, se muestra el mensaje con `getErrorMessage` (`@/lib/errors`) y el diálogo no se cierra. Es el patrón de `TicketForm.reload` (`TicketForm.tsx:122`).
- Revisar los tests que buscan el botón por nombre *después* de enviar (`TicketForm.test.tsx:178`, `TicketComments.test.tsx:159`) y ajustarlos si el envío sigue pendiente en ese momento.

## Paso 6: contenido y tipografía

- `break-words` / `min-w-0` en:
  - el `h1` de `TicketDetail.tsx:68`,
  - el texto de los comentarios (`TicketComments.tsx:93`, junto a `whitespace-pre-wrap`),
  - los valores del historial (`TicketHistory.tsx:47-50`),
  - el link del título en `TicketsTable.tsx:38-44`. Ahí `TableCell` trae `whitespace-nowrap`, así que esa celda necesita `whitespace-normal` y un `max-w` razonable.
- `tabular-nums` en el número (`TicketsTable.tsx:29`), la fecha (`TicketsTable.tsx:60`) y el contador de páginas (`TicketsList.tsx:76`).
- `<time dateTime={iso}>` en `TicketComments.tsx:85` y `TicketHistory.tsx:39`. El texto sale igual de `formatTimestamp`.
- Token `--success` en `apps/web/src/index.css`, en `:root` y en `.dark`, con contraste AA para texto chico (≥ 4.5:1). Agregar `--color-success: var(--success)` en `@theme`. `TicketDetail.tsx:96` pasa de `text-green-600` a `text-success`.

## Paso 7: estados y feedback

- **«Cambios guardados.» junto al botón.**
  - `TicketDetail` deja de renderizar `notice` en el encabezado y se lo pasa a `TicketForm` como prop `notice`.
  - `TicketForm` lo muestra al lado de «Guardar cambios», dentro de un `<p role="status">` siempre montado: si la región viva se monta junto con el texto, a veces no se anuncia.
  - Ajustar `TicketDetail.test.tsx` y `TicketForm.test.tsx` si consultan el aviso.
- **`TicketsList.tsx`.**
  - Un `<p role="status" className="sr-only">` siempre montado con el conteo («N tickets» o «Ningún ticket coincide con la búsqueda»).
  - «Cargando tickets…» lleva `role="status"`, igual que el «Cargando ticket…» de `TicketDetail.tsx:37`.
  - El contenedor con `aria-busy` atenúa la tabla con `opacity-60` mientras `isPlaceholderData`.
  - El error de carga suma un botón «Reintentar» que llama a `refetch`, que ya devuelve `useTickets` (TanStack Query).
- **`CatalogOptionSelect.tsx:46-48`.** Tomar `isPending` de `useCatalogOptions` y no calcular `currentIsOutOfOptions` mientras carga. Durante la carga, ofrecer `current` sin la marca «(inactivo)», para que el `SelectValue` muestre el valor actual sin parpadeo. Test nuevo en `CatalogOptionSelect.test.tsx`: con la consulta pendiente, el combobox muestra el nombre sin «(inactivo)».

## Verificación (en cada paso, antes del commit)

```bash
pnpm lint
pnpm --filter @syc/web typecheck
pnpm --filter @syc/web test
```

Al final de la rama:
- `pnpm turbo lint typecheck test build`.
- Prueba manual con `docker compose up` (web :5173), como admin y como agente:
  - cambiar estado a uno de cierre y clicar las etiquetas del diálogo,
  - editar un ticket y salir por el menú o recargar la pestaña (debe avisar),
  - eliminar un ticket con cambios sin guardar (no debe quedar bloqueado),
  - comentar y eliminar un comentario,
  - filtrar la bandeja.
- Si está disponible, revisar con un lector de pantalla o con el árbol de accesibilidad del navegador.

Los commits siguen el estilo del repo y terminan con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. La rama no se pushea ni se abre PR sin pedirlo.
