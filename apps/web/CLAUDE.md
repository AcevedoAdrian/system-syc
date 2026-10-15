# apps/web (Vite + React + TanStack)

Organización por *feature*, no por tipo de archivo: todo lo relacionado a un mismo dominio vive junto. Estructura planeada de carpetas en `docs/architecture.md`.

## Reglas del feature

- Cada carpeta de `features/<dominio>` expone hooks (`useTickets`, `useCreateTicket`) que envuelven el cliente oRPC + TanStack Query. Las rutas y los componentes de layout **nunca** llaman al cliente oRPC directamente.
- `routes/` solo compone: arma la página combinando hooks y componentes de `features/`; no contiene lógica de negocio ni fetching manual.
- `components/ui` no conoce el dominio (primitivos de shadcn); `features/*/components` sí.
- Los formularios usan react-hook-form con los esquemas Zod de `packages/contracts`.

## Particularidades

- **El cliente oRPC usa `OpenAPILink`**: la API expone el contrato como OpenAPI/REST, no como RPC.
- `src/routeTree.gen.ts` lo genera TanStack Router; no se edita a mano.
- **`VITE_API_URL` es una URL absoluta o una ruta que empieza con `/`** (`resolveApiUrl` en `src/lib/env.ts`). En desarrollo es absoluta (`http://localhost:3000`); en producción es `/api` (la API va por el mismo origen) y se resuelve contra `window.location.origin`. Una ruta sin barra inicial se rechaza. El cliente de Better Auth (`src/lib/auth-client.ts`) usa el **origen** de esa URL, porque él agrega `/api/auth` solo. Así la imagen de producción no depende de la IP del servidor.
- **`apps/web/Dockerfile` + `nginx.conf`** (SPEC 07): el build de Vite (`ARG VITE_API_URL=/api`) servido por Nginx, que además es la única entrada HTTP del sistema. Vite lee el `.env` de la raíz (`envDir`); el `.dockerignore` lo deja fuera para que ningún valor de desarrollo (`localhost:3000`) entre al build. Rutas de `nginx.conf`: `/api/auth/*` pasa intacta a la API (es el `basePath` de Better Auth), el resto de `/api/*` pierde el prefijo (`/api/tickets` → `/tickets`), un archivo del build se sirve tal cual y cualquier otra ruta devuelve `index.html` (recargar `/tickets/abc`). Pone `X-Real-IP` con la IP del cliente, agrega las cabeceras de seguridad (`add_header` a nivel `server`: si una `location` define alguno propio, deja de heredarlas) y resuelve `api` en cada request para seguir su IP si se recrea. Sin caché larga ni gzip, por decisión.

## Base visual

La web tiene una base visual común (SPEC 09): paleta crema con un solo coral en claro y oscuro (el tema sigue al sistema operativo, sin selector), serif solo en los títulos y componentes compartidos. Las reglas completas están en `docs/base-visual.md`; acá van las que se rompen sin querer:

- **Solo tokens.** `src/index.css` es el único archivo con valores de color. Un componente usa clases de token (`bg-primary`, `text-muted-foreground`, `bg-tono-rojo`), nunca la paleta de Tailwind ni un literal: `pnpm lint` corre `scripts/check-design-tokens.mjs` y falla nombrando archivo y línea. Un color nuevo es un token nuevo, en los dos temas, y entra en la lista de `src/tokens.contrast.test.ts` (4,5:1 o más).
- **Pantallas con `Page` y `PageHeader`** (el único `<h1>`), y `LoadingState`, `EmptyState` y `ErrorState` de `components/common/` para cargar, vaciar y fallar. Son los que usa el SPEC 11 al rediseñar tickets y administración; hoy esas pantallas conservan su estructura.
- **`<Badge tono="verde">`** para color por ítem: 16 tonos (`gris`, `rojo`, `naranja`, `amarillo`, `verde`, `azul`, `violeta`, `rosa`, `celeste`, `turquesa`, `lima`, `marron`, `indigo`, `magenta`, `bordo`, `pizarra`), siempre con texto. El color de un estado o prioridad (SPEC 10) sale del dato (`color` del ítem), nunca del nombre; el admin lo elige con `TonoSelect` (`features/catalogs/components/`), y los desplegables de ticket muestran las opciones con `OptionLabel` (`features/tickets/components/`), que deja la marca «(inactivo)» fuera de la insignia.
- **La galería `/estilos`** (`features/estilos`) muestra todo lo reutilizable y solo existe en desarrollo: con `import.meta.env.PROD` responde «no encontrado». No tiene link en el menú.
- **El menú y las migas son datos:** un módulo nuevo suma su sección en `MENU` de `components/layout/Sidebar.tsx` y su prefijo en `components/layout/breadcrumbs.ts`.
- **Los botones no tienen hover** (solo al presionar); el hover vive en filas y enlaces. Las fuentes se sirven desde el build (`@fontsource-variable/*`), sin CDN.
- `DESIGN.md` y `PRODUCT.md` (en esta carpeta) describen el sistema y el producto para quien diseña; ante una diferencia, mandan `src/index.css` y `docs/prd.md`.
