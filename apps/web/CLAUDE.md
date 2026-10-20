# apps/web (Vite + React + TanStack)

Organización por *feature*, no por tipo de archivo: todo lo relacionado a un mismo dominio vive junto. Estructura planeada de carpetas en `docs/architecture.md`.

## Reglas del feature

- Cada carpeta de `features/<dominio>` expone hooks (`useTickets`, `useCreateTicket`) que envuelven el cliente oRPC + TanStack Query. Las rutas y los componentes de layout **nunca** llaman al cliente oRPC directamente.
- `routes/` solo compone: arma la página combinando hooks y componentes de `features/`; no contiene lógica de negocio ni fetching manual.
- `components/ui` no conoce el dominio (primitivos de shadcn); `features/*/components` sí.
- Los formularios usan react-hook-form con los esquemas Zod de `packages/contracts`.

## Sistema visual

La referencia es la maqueta `docs/Maqueta-Dashboard/Main.dc.html` (SPEC 09, `specs/09-sistema-visual.md`, que dice qué etapa está hecha). Se replica en los componentes propios; no se copia su HTML.

- Los colores salen **solo** de los tokens de `src/index.css` (`bg-background`, `text-body`, `bg-primary`, `text-link`, `bg-feature`…). Prohibido hex, `rgb()`, `oklch()` y colores de la paleta de Tailwind (`bg-blue-500`, `text-red-600`) en los componentes.
- Si falta un color, se agrega un token nuevo en `index.css`: en `:root`, en `.dark` y en `@theme inline`. Nunca en el componente.
- `--primary` (`#a9583e`) es el botón principal y cumple AA con texto blanco. `--brand` (`#cc785c`) es el acento de marca (logo, foco, campo obligatorio): no lleva texto blanco encima.
- `--success` es el texto de confirmación (AA); `--teal` es decorativo (secciones, interruptor).
- Tipografías: `font-sans` (Inter), `font-heading` (Cormorant Garamond, títulos), `font-mono` (JetBrains Mono, número de ticket) y `font-brand` (Bricolage Grotesque, logo). Alojadas con `@fontsource`; no se usa Google Fonts.
- Se reutiliza `components/ui` antes de crear estilos propios.
- **Tema claro/oscuro**: la clase `dark` en `<html>` es la única fuente de verdad. `lib/theme.ts` la aplica (`initTheme()` en `main.tsx`, antes de renderizar), la guarda en `localStorage` (`syc-theme`) y cae en `prefers-color-scheme`. Se cambia con `<ThemeToggle />` (`components/common`); no se lee ni se escribe la clase a mano. Los componentes no ramifican por tema: usan tokens, y el `.dark` de `index.css` los cambia solo.
- **Layout autenticado** (`components/layout`): `AppShell` arma `Sidebar` (248px) y `Topbar`. Las migas de pan y las iniciales del avatar salen de `navigation.ts`; una ruta nueva suma su miga ahí y su enlace en `Sidebar.tsx`. El router marca `aria-current="page"` en todo enlace activo por su cuenta: no se agregan enlaces que apunten a una ruta padre de la página actual (por eso el logo va a `/` y «Catálogos» es un botón).
- **Color de estados y prioridades**: lo calcula `features/tickets/ticket-colors.ts` a partir de los catálogos (los estados de sistema por su `clave`, los demás por su posición; las prioridades contadas desde la última, que es la más urgente). No se guarda en la base. Se dibuja con `EstadoPill` y `PrioridadLabel` (`TicketBadges.tsx`); no se pintan puntos a mano.
- **Formularios de ticket**: se arman con `FormSection` (`components/common`, tarjeta de color: `tone` = `brand`, `amber`, `violet`, `teal` o `blue`), `Field` (etiqueta con ícono, contador `n/máx`, acción y error ligados al control) y `FormActionBar` (barra fija al pie). Las medidas de los controles (40px, texto de 16px) son `controlClass`, `textareaClass` y `selectClass` de `Field.tsx`. El detalle del ticket usa `TicketTabs`: los tres paneles quedan montados y se oculta el inactivo, para no perder lo escrito. El estado y el departamento se muestran de solo lectura en la edición y se cambian con sus diálogos.
- **Administración**: los formularios de departamentos, usuarios y catálogos se abren en un panel lateral (`FormDrawer` + `DrawerForm`, `components/common`); los diálogos (`Dialog`, `AlertDialog`, `ConfirmDialog`) son tarjetas de 420px y no traen «×». Un diálogo de eliminación se marca `destructive` (botón relleno en rojo, `variant="danger"`). Las listas usan las clases de `components/common/data-table.ts`, `RowAction` (botón de ícono con el nombre del registro en su etiqueta), `ActivePill` y `Switch` para «Activo». Un texto de ayuda de un campo no se repite como descripción del panel (un lector lo leería dos veces).
- **Direcciones inexistentes**: `__root.tsx` las resuelve con `components/layout/NotFound` (marco del login, la dirección y «Ir al inicio»), y `createRouter` usa `notFoundMode: "root"` para que una anidada (`/admin/xyz`) no quede dentro del marco autenticado. `/tickets/<id inexistente>` es una ruta válida y la resuelve `TicketDetail`.
- **Aviso de errores**: los formularios de alta y edición del ticket muestran `FormErrorSummary` arriba cuando un envío tuvo campos inválidos; el detalle sigue junto a cada campo. El agrupado de áreas por tipo (`features/catalogs/area-groups.ts`) lo comparten el selector del formulario y el filtro de la bandeja.
- **Actuación simple del alta**: el campo arranca en `/{año}` (año de `hoyArgentina()`), el cursor queda delante de la barra al entrar, y si se envía sin tocar va como `null`. La edición muestra lo guardado.
- `Button` con `variant="link"` usa `--link`: el primario no sirve de color de texto en oscuro.
- `<Logo height={…} />` (`components/common/Logo.tsx`) es el logotipo; sus estilos están en `index.css` (`.logo-*`).

## Particularidades

- **El cliente oRPC usa `OpenAPILink`**: la API expone el contrato como OpenAPI/REST, no como RPC.
- `src/routeTree.gen.ts` lo genera TanStack Router; no se edita a mano.
- **`VITE_API_URL` es una URL absoluta o una ruta que empieza con `/`** (`resolveApiUrl` en `src/lib/env.ts`). En desarrollo es absoluta (`http://localhost:3000`); en producción es `/api` (la API va por el mismo origen) y se resuelve contra `window.location.origin`. Una ruta sin barra inicial se rechaza. El cliente de Better Auth (`src/lib/auth-client.ts`) usa el **origen** de esa URL, porque él agrega `/api/auth` solo. Así la imagen de producción no depende de la IP del servidor.
- **`apps/web/Dockerfile` + `nginx.conf`** (SPEC 07): el build de Vite (`ARG VITE_API_URL=/api`) servido por Nginx, que además es la única entrada HTTP del sistema. Vite lee el `.env` de la raíz (`envDir`); el `.dockerignore` lo deja fuera para que ningún valor de desarrollo (`localhost:3000`) entre al build. Rutas de `nginx.conf`: `/api/auth/*` pasa intacta a la API (es el `basePath` de Better Auth), el resto de `/api/*` pierde el prefijo (`/api/tickets` → `/tickets`), un archivo del build se sirve tal cual y cualquier otra ruta devuelve `index.html` (recargar `/tickets/abc`). Pone `X-Real-IP` con la IP del cliente, agrega las cabeceras de seguridad (`add_header` a nivel `server`: si una `location` define alguno propio, deja de heredarlas) y resuelve `api` en cada request para seguir su IP si se recrea. Sin caché larga ni gzip, por decisión.
