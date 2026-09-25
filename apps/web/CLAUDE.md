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
