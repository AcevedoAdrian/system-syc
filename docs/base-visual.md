# Base visual

Las reglas para construir pantallas y módulos nuevos de la web con la misma base visual: la paleta crema con un solo coral, la serif en los títulos y los componentes compartidos. Lo decidió el SPEC 09, en `specs/`.

## Qué documenta cada archivo

| Archivo | Qué es | Quién lo mantiene |
|---|---|---|
| `apps/web/src/index.css` | **Los valores**: colores, tonos, radios y fuentes, en el tema claro y en el oscuro. Es la fuente de verdad | A mano |
| `apps/web/src/tokens.contrast.test.ts` | Exige contraste AA (4,5:1) en cada texto y cada tono, en los dos temas | A mano |
| `apps/web/DESIGN.md` | La descripción visual del sistema: tokens, los 8 tonos y los componentes compartidos | Generado; se puede reescribir al regenerarlo |
| `apps/web/PRODUCT.md` | El producto visto desde el diseño. Ante una diferencia con `docs/prd.md`, manda el PRD | A mano |
| `docs/base-visual.md` (este archivo) | **Las reglas** para módulos nuevos; tiene que sobrevivir a una regeneración de `DESIGN.md` | A mano |
| `/estilos` | La galería viva de todo lo reutilizable. Solo existe en desarrollo y no tiene link en el menú | Código |

Si `DESIGN.md` y `index.css` difieren en un valor, vale `index.css`.

## Módulos nuevos

Una pantalla nueva respeta esto:

1. **Armala con `Page` y `PageHeader`.** `Page` da el ancho y el espaciado; `PageHeader` es el único `<h1>` de la pantalla, con descripción y acciones opcionales. No escribas un `<h1>` a mano.
2. **Cargar, vaciar y fallar tienen componente.** `LoadingState` (`role="status"`), `EmptyState` y `ErrorState` (`role="alert"`, con «Reintentar» si recibe `onRetry`). No improvises un texto plano.
3. **Solo tokens.** Un color sale de una clase de token (`bg-primary`, `text-muted-foreground`, `bg-tono-rojo`), nunca de la paleta de Tailwind (`bg-red-600`, `bg-white`) ni de un literal (`#f00`, `rgb(…)`). `pnpm lint` rechaza los colores sueltos y nombra archivo y línea.
4. **Mirá `/estilos` antes de crear un componente.** Si ya existe, usalo; si falta algo, se agrega a la galería junto con el componente.
5. **El estado nunca va solo en color.** Una insignia, un punto o un tono lleva su texto al lado. Para colorear usá `<Badge tono="verde">`: son 8 tonos (`gris`, `rojo`, `naranja`, `amarillo`, `verde`, `azul`, `violeta`, `rosa`).
6. **El coral marca dónde se actúa.** La acción principal, el enlace y el foco; no sirve de decoración ni para decir «bien» o «mal».
7. **La serif es solo para el título de pantalla.** Lo demás va en Inter, y los números de ticket y códigos en JetBrains Mono (`font-mono`).
8. **Sumá tu módulo al menú y a las migas.** Una sección nueva en `MENU` de `components/layout/Sidebar.tsx` y su prefijo en `components/layout/breadcrumbs.ts`. El resto del menú no se rediseña.

## Cuando hace falta un color o un tono nuevo

Un color nuevo es un token nuevo, y se agrega en `apps/web/src/index.css`:

1. Definilo en el bloque `:root` **y** en el de `@media (prefers-color-scheme: dark)`; el test falla si falta en un tema.
2. Registralo en `@theme inline` (`--color-<nombre>`) para que exista la clase de Tailwind.
3. Si es un texto o un relleno con texto, agregalo a la lista de pares de `tokens.contrast.test.ts`: tiene que dar 4,5:1 o más en los dos temas.

Un tono de insignia nuevo es un vocabulario nuevo para el administrador (SPEC 10): se agrega a `badgeTonos` en `components/ui/badge.tsx` con sus tres valores (fondo, texto y borde).

## Reglas de la base

- **El tema sigue al sistema operativo.** No hay clase `.dark` ni selector: las variantes `dark:` de Tailwind responden a `prefers-color-scheme`.
- **Escritorio y notebook, 1280 px o más.** A 1024 px nada se rompe ni scrollea de costado; una tabla ancha scrollea dentro de su contenedor. Tablet y celular no se optimizan.
- **Controles de 36 px** (40 px en el botón grande) y radios de 8 px en botones y campos y de 12 px en tarjetas y diálogos.
- **Plano por defecto.** Sin sombras decorativas: separan el color y el filete de 1 px. Los botones no cambian al pasar el mouse, solo al presionar; el hover vive en filas de tabla y en enlaces.
- **Las fuentes se sirven desde el propio build** (`@fontsource`); la app no pide nada a un CDN.

## Qué no cubre

- Las pantallas de tickets y de administración conservan su estructura anterior: toman la paleta y la tipografía nuevas por usar tokens, pero su rediseño es el SPEC 11.
- El color de cada estado y prioridad lo elige el administrador desde el SPEC 10; esta base solo define los 8 tonos entre los que elige.
- Un selector manual de tema y la adaptación a celular quedan para un spec propio.
