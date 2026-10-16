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

## Particularidades

- **El cliente oRPC usa `OpenAPILink`**: la API expone el contrato como OpenAPI/REST, no como RPC.
- `src/routeTree.gen.ts` lo genera TanStack Router; no se edita a mano.
- **`VITE_API_URL` es una URL absoluta o una ruta que empieza con `/`** (`resolveApiUrl` en `src/lib/env.ts`). En desarrollo es absoluta (`http://localhost:3000`); en producción es `/api` (la API va por el mismo origen) y se resuelve contra `window.location.origin`. Una ruta sin barra inicial se rechaza. El cliente de Better Auth (`src/lib/auth-client.ts`) usa el **origen** de esa URL, porque él agrega `/api/auth` solo. Así la imagen de producción no depende de la IP del servidor.
- **`apps/web/Dockerfile` + `nginx.conf`** (SPEC 07): el build de Vite (`ARG VITE_API_URL=/api`) servido por Nginx, que además es la única entrada HTTP del sistema. Vite lee el `.env` de la raíz (`envDir`); el `.dockerignore` lo deja fuera para que ningún valor de desarrollo (`localhost:3000`) entre al build. Rutas de `nginx.conf`: `/api/auth/*` pasa intacta a la API (es el `basePath` de Better Auth), el resto de `/api/*` pierde el prefijo (`/api/tickets` → `/tickets`), un archivo del build se sirve tal cual y cualquier otra ruta devuelve `index.html` (recargar `/tickets/abc`). Pone `X-Real-IP` con la IP del cliente, agrega las cabeceras de seguridad (`add_header` a nivel `server`: si una `location` define alguno propio, deja de heredarlas) y resuelve `api` en cada request para seguir su IP si se recrea. Sin caché larga ni gzip, por decisión.
