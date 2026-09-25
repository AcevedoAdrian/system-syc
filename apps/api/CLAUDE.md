# apps/api (NestJS)

Un módulo por dominio de negocio, autocontenido: controla sus propias entidades, permisos y casos de uso, sin depender de los internos de otro módulo. Estructura planeada de carpetas en `docs/architecture.md`.

## Reglas del módulo

- El controller (o router oRPC) solo orquesta: valida con el esquema de `packages/contracts` y delega en el service.
- El service contiene la lógica de negocio y llama al repository; **nunca** importa Prisma directamente en el controller.
- El repository es la única capa que conoce Prisma; si cambia el ORM, el resto del módulo no se entera.
- Los permisos se resuelven con guards a nivel de módulo o de endpoint, **nunca** dentro del service.

## Particularidades

- **Se empaqueta con `tsdown`** (ESM, `dist/main.mjs`). `@syc/contracts` y `@syc/db` son `devDependencies` que entran en el bundle porque exportan su fuente `.ts`. Prisma y `@orpc/*` van como `dependencies` (externos al bundle). Emite la decorator metadata que Nest necesita.
- **Biome tiene desactivado `useImportType` en `apps/api/**`**: Nest necesita los imports como valor para la inyección de dependencias. No los conviertas a `import type`.
- **`@orpc/nest` expone el contrato como OpenAPI/REST** (`GET /health`), no como RPC en `/rpc`.
- Las variables de entorno se validan con Zod al arrancar (`src/config`).
