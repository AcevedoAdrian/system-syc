# SPEC 09 — Base visual con impeccable

> **Status:** Approved
> **Depends on:** SPEC 01 (esqueleto del monorepo), SPEC 02 (autenticación y acceso), SPEC 06 (comentarios y bandeja)
> **Date:** 2026-10-13
> **Objective:** usar el skill impeccable, instalado solo en local y sin hooks ni telemetría, para elegir sobre la bandeja y dejar una base visual (paleta clara y oscura, tipografía, componentes compartidos, galería y reglas chequeadas en `pnpm lint`) aplicada al login y al marco, para que las pantallas y los módulos nuevos la reutilicen.

## Por qué existe este spec

La web usa el tema neutro de shadcn sin ninguna decisión propia:

- Todo es gris puro.
- El encabezado de cada una de las 6 pantallas se arma a mano (`<h1 className="text-2xl font-semibold">`).
- Cada pantalla escribe su propio «Cargando…» como texto plano.
- `HealthIndicator` usa colores sueltos (`bg-red-600`, `bg-green-600`, `bg-amber-600`).
- El CSS define un tema `.dark` que nadie activa.

El PRD define el sistema como una **cáscara extensible**: inventario, notas o tareas van a llegar como módulos nuevos. Sin una base común, cada módulo inventaría la suya.

impeccable (Apache 2.0, de Paul Bakaus) es un skill de diseño para agentes. Trae 24 comandos (`init`, `document`, `shape`, `craft`, `audit`, `polish`…), un detector determinista de 59 reglas y un hook que lo corre mientras Claude edita la UI. Sirve para elegir la dirección visual y para auditarla. En este repo se usa **solo en local**: ni el skill, ni los subagentes, ni el hook, ni la telemetría forman parte del repositorio. Lo que queda versionado es su resultado: los tokens, los componentes, los documentos y el chequeo de colores.

Decisiones del usuario del 2026-10-13:

- Tres specs:
  - 09: skill, base visual y marco;
  - 10: color por ítem en Estados y Prioridades;
  - 11: rediseño de tickets y administración.
- impeccable propone 2 o 3 direcciones visuales sobre la bandeja, y el usuario elige.
- Habrá tema claro y oscuro, según el sistema operativo, sin selector.
- La base incluye paleta, componentes compartidos y una galería.
- Para que la base se respete: reglas escritas y un chequeo en `pnpm lint` que rechaza colores sueltos.
- Se diseña para escritorio y notebook (1280 px o más).
- `PRODUCT.md` va completo, como lo arma `/impeccable init`.
- El nombre visible sigue siendo «system-syc».
- Que el admin elija el color de cada estado y prioridad va en el SPEC 10.

Cambios del usuario del 2026-10-14, que reemplazan lo que el 2026-10-13 se había decidido sobre la instalación, el hook y la telemetría:

- impeccable se instala solo en local y no se sube al repositorio.
- El hook de diseño no se instala.
- La telemetría de impeccable se apaga.
- `PRODUCT.md` y `DESIGN.md` sí se versionan, en `apps/web`.
- Las reglas para módulos nuevos van en `docs/base-visual.md`.
- Ningún archivo de configuración compartido nombra a impeccable: ni `biome.json`, ni `.dockerignore`, ni `.gitignore`.
- El `PRODUCT.md` anterior se borró: se genera de nuevo en el paso 2.

## Alcance

**Dentro:**

- Instalación local de impeccable con `npx impeccable install --providers=claude --scope=project`:
  - `.claude/skills/impeccable/` (SKILL.md, `reference/`, `scripts/`);
  - `.claude/agents/impeccable-*.md` (4 subagentes);
  - sin hooks: si el instalador escribe hooks en `.claude/settings.json`, se quitan después;
  - telemetría apagada con `npx impeccable telemetry off`;
  - todo queda ignorado por `.git/info/exclude` de la máquina, no por `.gitignore`;
  - `biome.json`, `.dockerignore` y `.gitignore` no cambian.
- `apps/web/PRODUCT.md`, escrito por `/impeccable init` (la versión anterior se borró y se genera de nuevo).
- La elección de la dirección visual:
  - 2 o 3 propuestas sobre la bandeja, en claro y en oscuro;
  - las maquetas no se mergean;
  - la implementación se detiene hasta que el usuario elige;
  - la elección queda en la sección "Dirección elegida" de este spec.
- Tokens en `apps/web/src/index.css`:
  - paleta clara y oscura por `prefers-color-scheme`;
  - tipografía autoalojada con `@fontsource`;
  - radios y sombras;
  - tokens de estado (`success`, `warning`, `info`, `destructive`);
  - 8 tonos de insignia.
- Componentes compartidos en `apps/web/src/components/common/`: `Page`, `PageHeader`, `LoadingState`, `EmptyState` y `ErrorState`. La prop `tono` en `components/ui/badge.tsx`.
- Ajuste de los primitivos de `components/ui/*` a la dirección elegida, sin cambiar su API.
- La galería `/estilos`, solo en desarrollo.
- Rediseño del marco:
  - `AppShell`;
  - `Sidebar`, con secciones por módulo;
  - `Topbar`;
  - `HealthIndicator`, con tokens de estado.
- Rediseño del login: `routes/login.tsx` y `LoginForm`.
- `scripts/check-design-tokens.mjs`, encadenado en `pnpm lint`.
- `apps/web/DESIGN.md`, escrito por `/impeccable document` sobre la base ya aplicada: tokens, tonos y componentes compartidos.
- `docs/base-visual.md`, escrito a mano y versionado:
  - las reglas para módulos nuevos;
  - qué documenta `DESIGN.md` y qué documenta este archivo.
- `scripts/verify/specs/09-base-visual.mjs`.
- Actualizar `CLAUDE.md`, `apps/web/CLAUDE.md`, `docs/architecture.md` y `specs/00-catalogo-specs.md`.

**Fuera de alcance (para specs futuros):**

- Rediseñar la bandeja, el alta, el detalle, los comentarios, el historial y las pantallas de administración (SPEC 11). Toman los colores y la tipografía nuevos solos, porque usan los tokens de shadcn, pero no cambian su estructura.
- Que el admin elija el color de cada estado y prioridad (SPEC 10). Este spec solo define los tonos entre los que se elige.
- Versionar el skill, los subagentes o `.impeccable/`, y hacer que quien clone el repo tenga `/impeccable`.
- Los hooks de impeccable y su telemetría.
- Nombrar a impeccable en archivos de configuración compartidos (`biome.json`, `.dockerignore`, `.gitignore`), y documentar su instalación en el repo.
- Adaptación a tablet y celular.
- Un selector manual de tema.
- El detector de impeccable en el CI.
- Logo o identidad institucional, y cambiar el nombre visible.
- Instalar impeccable para otras herramientas (Codex, Cursor…).
- Atajos fijados (`/impeccable pin`) y el live mode.
- `packages/ui`, que se crea con la segunda app.

## Modelo de datos

Este spec no introduce datos persistentes: no hay migración ni contrato nuevo. Lo que fija son nombres: tokens, tonos y la API de los componentes compartidos. Los **valores** (colores, fuente, radio) salen de la dirección elegida.

```css
/* apps/web/src/index.css (nombres; los valores salen de la dirección elegida) */
@custom-variant dark (@media (prefers-color-scheme: dark)); /* reemplaza a (&:is(.dark *)) */

:root {
  /* Se conservan los nombres de shadcn: background, foreground, card, popover, primary (acento de
     marca), secondary, muted, accent (hover), destructive, border, input, ring, sidebar-*. */
  --success: …; --success-foreground: …;
  --warning: …; --warning-foreground: …;
  --info: …;    --info-foreground: …;
  /* Tonos de insignia: fondo, texto y borde por tono. */
  --tono-gris: …; --tono-gris-foreground: …; --tono-gris-border: …;
  /* ídem rojo, naranja, amarillo, verde, azul, violeta, rosa */
}
@media (prefers-color-scheme: dark) {
  :root { /* los mismos tokens, en oscuro */ }
}
/* Se elimina el bloque .dark. */
```

```tsx
// apps/web/src/components/ui/badge.tsx (fragmento)
export const badgeTonos = ["gris", "rojo", "naranja", "amarillo", "verde", "azul", "violeta", "rosa"] as const;
export type BadgeTono = (typeof badgeTonos)[number];
// <Badge tono="verde">Cerrado</Badge>. `variant` sigue existiendo; `tono` la pisa.

// apps/web/src/components/common/
<Page>                                         {/* ancho, márgenes y espaciado vertical estándar */}
  <PageHeader title="Tickets" description="…" actions={<Button>Nuevo ticket</Button>} />  {/* único <h1> */}
  <LoadingState label="Cargando tickets…" />   {/* role="status" */}
  <EmptyState title="No hay tickets" description="…" action={…} />
  <ErrorState title="No se pudo cargar" description={mensaje} onRetry={refetch} />  {/* role="alert" */}
</Page>
```

Convenciones:

- `index.css` es el único archivo de `apps/web/src` con valores de color.
- Los componentes usan clases de tokens (`bg-primary`, `text-muted-foreground`, `bg-tono-rojo`), nunca la paleta de Tailwind ni colores literales.
- Los 8 tonos son el vocabulario del SPEC 10. Cada uno cumple contraste AA (4,5:1) entre su texto y su fondo, en claro y en oscuro.
- La fuente se sirve desde el propio build (`@fontsource*`): ningún pedido a CDNs en tiempo de ejecución.
- Nada versionado depende de que impeccable esté instalado: ni un test, ni un script, ni el CI, ni `pnpm verify`.

## Contrato

### Feature 9.1 — impeccable en local

- `/impeccable <comando>` está disponible en Claude Code solo en las máquinas donde se instaló. Quien clone el repo no lo tiene.
- Ninguno de estos archivos está en git: `.claude/skills/impeccable/`, `.claude/agents/impeccable-*.md` y `.impeccable/`.
  - Los ignora `.git/info/exclude` de cada clon, con estas líneas: `.claude/skills/impeccable/`, `.claude/agents/impeccable-*.md`, `.impeccable/` y `/apps/web/DESIGN.json`.
  - `.gitignore`, `biome.json` y `.dockerignore` no cambian.
  - Biome respeta `.git/info/exclude` porque `biome.json` ya tiene `vcs.useIgnoreFile` (comprobado el 2026-10-14: un `.json` mal formateado en `.impeccable/` no se marca, y uno fuera del exclude sí).
  - Los Dockerfiles de la API y la web copian solo `apps/` y `packages/`, nunca la raíz: `.claude/` y `.impeccable/` no entran a ninguna imagen.
- No hay hooks de impeccable: ni en `.claude/settings.json` ni en `.claude/settings.local.json`. El detector se corre a mano (`.claude/skills/impeccable/scripts/impeccable detect <ruta>`).
- La telemetría está apagada.
- Se actualiza con `npx impeccable update`, y los archivos de `.claude/skills/impeccable/` y `.claude/agents/impeccable-*.md` no se editan a mano.

### Feature 9.2 — Dirección visual

- impeccable presenta 2 o 3 direcciones aplicadas a una maqueta de la bandeja:
  - 20 filas, con estados, prioridades, el filtro y la paginación;
  - a 1280 px;
  - en claro y en oscuro.
- El usuario elige una, o pide variantes. Sin elección no se avanza al paso 4.
- La elegida queda descripta en "Dirección elegida" (abajo) y, al final, en `apps/web/DESIGN.md`.

### Feature 9.3 — Tokens y tema

- El tema sigue al sistema operativo: si cambia, la app cambia sin recargar.
- Contraste de los textos, verificado por `tokens.contrast.test.ts`, que lee los valores de `index.css`:
  - `foreground` sobre `background`, `card` y `popover`;
  - `muted-foreground` sobre `background` y `muted`;
  - cada `*-foreground` sobre su fondo;
  - cada tono sobre su fondo;
  - todos con 4,5:1 o más, en los dos temas.
- Los primitivos de `components/ui` siguen funcionando con los mismos nombres de token (`npx shadcn add` sigue siendo compatible).

### Feature 9.4 — Componentes compartidos

- `Page`: contenedor con el ancho y el espaciado estándar de una pantalla.
- `PageHeader`:
  - es el único `<h1>` de la pantalla;
  - tiene descripción opcional y acciones a la derecha.
- `LoadingState`: `role="status"` y el texto que recibe. Las pantallas que lo adopten en el SPEC 11 conservan sus tests (`getByRole("status")`).
- `EmptyState`: título, descripción y acción opcionales.
- `ErrorState`:
  - `role="alert"`, con título y descripción;
  - con `onRetry`, muestra el botón "Reintentar", que lo llama.
- `Badge` con `tono` usa el fondo, el texto y el borde del tono.

### Feature 9.5 — Galería `/estilos`

- `routes/_authenticated/estilos.tsx`, con sesión iniciada, muestra todo lo que un módulo nuevo debe reutilizar:
  - la paleta;
  - la tipografía;
  - botones, campos, select, checkbox, tabla, pestañas y diálogo;
  - los 8 tonos de insignia;
  - `PageHeader` y los tres estados.
- Solo en desarrollo: en el build de producción (`import.meta.env.PROD`), la ruta responde la página de "no encontrado".
- No tiene link en el menú.

### Feature 9.6 — Marco y login

- `Sidebar`:
  - una sección por módulo («Tickets» hoy, «Administración» para el admin);
  - el link activo marcado;
  - `HealthIndicator` al pie;
  - un módulo futuro suma su sección sin rediseñar el menú.
- `Topbar`: «system-syc», el nombre del usuario, "Cambiar contraseña" y "Cerrar sesión".
- `HealthIndicator`: `success` (ok), `warning` (degraded) y `destructive` (caída), siempre con texto además del color.
- Login: el formulario rediseñado, con la misma conducta (errores, rate limit, redirección).
- A 1024 px de ancho, ni el marco ni el login tienen scroll horizontal.

### Feature 9.7 — Chequeo de colores

- `pnpm lint` corre `biome check . && node scripts/check-design-tokens.mjs`. El CI ya corre `pnpm lint` sobre todo el repo.
- El script recorre `apps/web/src/**/*.{ts,tsx}`, salvo `routeTree.gen.ts`, y rechaza:
  - clases de la paleta de Tailwind (`bg-red-600`, `text-slate-500`, `border-white`, `ring-black`… con cualquier prefijo de color);
  - colores literales dentro de strings o template literals (`#f00`, `#ff0000`, `rgb(`, `hsl(`, `oklch(`).
- Ignora los comentarios, para que «PR #123» no cuente.
- Cada falla sale como `archivo:línea: <coincidencia>` y el script termina con código 1.
- No hay comentario de excepción: un color nuevo es un token nuevo en `index.css`.
- Es la única regla de diseño que se hace cumplir en el CI. No depende de impeccable.

### Feature 9.8 — Documentos versionados

- `apps/web/PRODUCT.md`: lo que `/impeccable init` arma sobre el producto. Ante una diferencia con `docs/prd.md`, manda el PRD.
- `apps/web/DESIGN.md`: documenta los tokens, los 8 tonos y los componentes compartidos, y la dirección elegida. Lo genera `/impeccable document`, así que volver a correrlo puede reescribirlo.
- `docs/base-visual.md`: lo que se escribe a mano y tiene que sobrevivir a una regeneración de `DESIGN.md`:
  - sección "Módulos nuevos": usar `Page`, `PageHeader` y los tres estados; solo tokens (`pnpm lint` rechaza los colores sueltos); mirar `/estilos` antes de crear un componente.
- `apps/web/CLAUDE.md` tiene la sección "Base visual", con las reglas resumidas y el enlace a `docs/base-visual.md`.

## Plan de implementación

1. **Instalar impeccable en local.**
   - Correr `npx impeccable install --providers=claude --scope=project`.
   - Si escribió hooks, quitarlos de `.claude/settings.json` (o correr `/impeccable hooks off`); si el archivo queda sin otra cosa, borrarlo.
   - Apagar la telemetría con `npx impeccable telemetry off`.
   - Confirmar que `.git/info/exclude` tiene las 4 líneas de la Feature 9.1 y que ya no lista `/apps/web/PRODUCT.md` ni `/apps/web/DESIGN.md`, porque esos dos archivos se versionan.
   - No tocar `biome.json`, `.dockerignore` ni `.gitignore`.

   Verificar:
   - `/impeccable` aparece en Claude Code;
   - `git status` no muestra archivos de impeccable y `git ls-files` no los lista;
   - `.claude/settings.json` no existe o no menciona impeccable, y `.claude/settings.local.json` tampoco;
   - el CLI confirma la telemetría apagada;
   - `pnpm lint` pasa con los archivos de impeccable presentes;
   - `git diff` no muestra cambios en `biome.json`, `.dockerignore` ni `.gitignore`;
   - las imágenes de la web y la API, construidas, no contienen `.claude/` ni `.impeccable/`.
2. **`apps/web/PRODUCT.md`.** Correr `/impeccable init`, porque el anterior se borró; el usuario responde sus preguntas. Verificar: el archivo existe, `git status` lo muestra como nuevo (no ignorado) y `impeccable context` no informa huecos.
3. **Elegir la dirección.** Generar las 2 o 3 propuestas sobre la maqueta de la bandeja (Feature 9.2). **Punto de detención**: esperar la elección del usuario y completar "Dirección elegida".
4. **Tokens.**
   - Reescribir `index.css`: valores elegidos, oscuro por `prefers-color-scheme`, `@custom-variant dark` por media query, fuente con `@fontsource`, `warning`, `info` y los 8 tonos.
   - Eliminar `.dark`.
   - Ajustar `components/ui/*` a la dirección, sin cambiar su API.
   - Agregar `tokens.contrast.test.ts`, con `culori` como dependencia de desarrollo y versión exacta.

   Verificar:
   - el test de contraste pasa;
   - los tests existentes de la web pasan;
   - con el sistema operativo en oscuro, la app se ve en oscuro.
5. **Componentes compartidos.** `Page`, `PageHeader`, `LoadingState`, `EmptyState` y `ErrorState` en `components/common/`, y `tono` en `Badge`. Verificar con tests de componente:
   - `LoadingState` expone `role="status"`;
   - `ErrorState` expone `role="alert"`, y "Reintentar" llama a `onRetry`;
   - `PageHeader` renderiza un único `h1`;
   - cada tono aplica sus clases.
6. **Galería `/estilos`.** Verificar con tests: en desarrollo renderiza las secciones; con `PROD` responde "no encontrado".
7. **Marco y login.** Rediseñar `AppShell`, `Sidebar`, `Topbar`, `HealthIndicator`, `routes/login.tsx` y `LoginForm` con la base. Actualizar `HealthIndicator.test.tsx`, `Sidebar.test.tsx` y `LoginForm.test.tsx` solo donde cambia el markup.

   Verificar:
   - en esta máquina, `.claude/skills/impeccable/scripts/impeccable detect` sobre `components/layout`, `components/common`, `features/auth/components`, `features/health/components`, `routes/login.tsx` y `routes/_authenticated/estilos.tsx` termina con código 0;
   - a 1024 px no hay scroll horizontal.
8. **Chequeo de colores.** Escribir `scripts/check-design-tokens.mjs` (Feature 9.7) y encadenarlo en `pnpm lint`. Verificar:
   - sobre el repo pasa;
   - un archivo temporal con `bg-red-600` y otro con `"#ff0000"` lo hacen fallar nombrando archivo y línea;
   - un comentario con `#123` no falla.
9. **Documentos.**
   - Correr `/impeccable document` sobre la base aplicada, para `apps/web/DESIGN.md`.
   - Escribir `docs/base-visual.md` (Feature 9.8).

   Verificar:
   - `DESIGN.md` documenta los tokens, los 8 tonos y los componentes compartidos;
   - `docs/base-visual.md` tiene "Módulos nuevos";
   - `git status` muestra `apps/web/PRODUCT.md`, `apps/web/DESIGN.md` y `docs/base-visual.md` como nuevos, y nada de impeccable.
10. **Verificación y documentación.**
    - `scripts/verify/specs/09-base-visual.mjs`, agregado a `specs/index.mjs`. Comprueba solo lo que vive en el repo:
      - `index.css` no tiene bloque `.dark`;
      - `tokens.contrast.test.ts` pasa;
      - `check-design-tokens.mjs` falla y pasa con archivos temporales como en el paso 8;
      - el CSS del build de la web no referencia otros orígenes.

      El script no nombra a impeccable: lo relativo a su instalación local se verifica a mano en los pasos 1 y 9.
    - `CLAUDE.md`:
      - estado del repo;
      - `/estilos` y el chequeo de colores en `pnpm lint`;
      - `apps/web/PRODUCT.md`, `apps/web/DESIGN.md` y `docs/base-visual.md` en la lista de documentación;
      - `pnpm verify` de SPEC 01 a 09.
    - `apps/web/CLAUDE.md`: la sección "Base visual" (Feature 9.8).
    - `docs/architecture.md`: la fila UI menciona la base visual y `docs/base-visual.md`.
    - `specs/00-catalogo-specs.md`: la fila de SPEC 09.

    Verificar: `pnpm verify --spec 09` y `pnpm turbo lint typecheck test build` pasan.

## Dirección elegida

_Se completa en el paso 3 de la implementación, con la propuesta que elija el usuario: paleta, tipografía, densidad y radio._

## Criterios de aceptación

- [ ] `.claude/skills/impeccable/SKILL.md` y los 4 `.claude/agents/impeccable-*.md` existen en la máquina de desarrollo, `/impeccable` está disponible en Claude Code, y `git ls-files` no lista ninguno de esos archivos ni nada de `.impeccable/`.
- [ ] `.gitignore` no cambió. Después de instalar y de correr `/impeccable audit`, `git status` no muestra archivos de impeccable.
- [ ] No hay hooks de impeccable: `.claude/settings.json` no existe o no menciona impeccable, y `.claude/settings.local.json` tampoco.
- [ ] La telemetría de impeccable está apagada, y el CLI lo confirma.
- [ ] Las imágenes de producción de la web y de la API no contienen `.claude/` ni `.impeccable/`.
- [ ] `apps/web/PRODUCT.md` y `apps/web/DESIGN.md` están en git. `DESIGN.md` documenta los tokens, los 8 tonos y los componentes compartidos.
- [ ] `docs/base-visual.md` existe y tiene la sección "Módulos nuevos".
- [ ] `biome.json`, `.dockerignore` y `.gitignore` no cambiaron respecto de `main`, y `pnpm lint` pasa con los archivos de impeccable presentes en la máquina.
- [ ] Ni `package.json`, `turbo.json`, `.github/`, `scripts/`, `apps/web/src` ni la configuración compartida nombran a impeccable.
- [ ] La sección "Dirección elegida" de este spec describe la propuesta que eligió el usuario.
- [ ] `index.css` no tiene bloque `.dark`. Con el sistema operativo en oscuro, la app se ve en oscuro sin recargar.
- [ ] `tokens.contrast.test.ts` pasa: cada texto y cada tono tienen contraste de 4,5:1 o más sobre su fondo, en claro y en oscuro.
- [ ] La fuente se sirve desde el build: cargar la app no hace pedidos a otros orígenes.
- [ ] `Page`, `PageHeader`, `LoadingState`, `EmptyState`, `ErrorState` y `Badge` con `tono` existen y tienen tests. `LoadingState` expone `role="status"`, y `ErrorState` expone `role="alert"` y llama a `onRetry`.
- [ ] `/estilos` muestra la galería en desarrollo y responde "no encontrado" en el build de producción.
- [ ] `HealthIndicator` usa `success`, `warning` y `destructive`, con texto además del color.
- [ ] En la máquina donde impeccable está instalado, el detector sobre el marco, el login, `components/common` y la galería termina con código 0.
- [ ] A 1024 px de ancho, ni el marco ni el login tienen scroll horizontal.
- [ ] Ningún archivo de `apps/web/src` salvo `index.css` tiene clases de la paleta de Tailwind ni colores literales.
- [ ] `pnpm lint` falla nombrando archivo y línea si un componente usa `bg-red-600` o `"#ff0000"`, y no falla por un comentario con `#123`.
- [ ] Las pantallas de tickets y administración se comportan igual: todos sus tests pasan sin cambios.
- [ ] `apps/web/CLAUDE.md` tiene la sección "Base visual", con el enlace a `docs/base-visual.md`.
- [ ] `pnpm verify --spec 09` y `pnpm turbo lint typecheck test build` terminan con código 0, sin que impeccable esté instalado.

## Decisiones

- **Sí:** impeccable instalado solo en local (decisión del usuario, 2026-10-14). El repo no sube el skill, los subagentes ni `.impeccable/`. La base visual no depende de él: lo que el repo necesita para sostenerla (tokens, componentes, `check-design-tokens`, documentos) está versionado.
- **Sí:** el instalador oficial con `--providers=claude --scope=project`, ignorado por `.git/info/exclude`. Es la única forma que deja la versión del skill escrita para Claude Code, con sus 4 subagentes, y actualizable con `npx impeccable update`.
- **No:** `--scope=user`. Instalaría impeccable en `~/.claude` para todos los proyectos de la máquina, y los subagentes ya viven en este repo.
- **No:** el bloque `# impeccable-ignore-start … # impeccable-ignore-end` en `.gitignore`. Está versionado: lo vería quien clone, y diría que el repo usa impeccable. `.git/info/exclude` hace lo mismo sin tocar nada compartido.
- **No:** `npx skills add`, como los otros skills del repo. Tomaría la versión genérica, escrita para Codex (`$impeccable`, sin `argument-hint` ni subagentes de Claude). Además lo registraría en `skills-lock.json`, que está versionado.
- **No:** el plugin de Claude Code ni el submódulo de git. El primero queda en el usuario sin ser reproducible; el segundo trae el repo entero de impeccable.
- **No:** el hook de diseño (decisión del usuario, 2026-10-14). Reemplaza la decisión del 2026-10-13. El detector se corre a mano. Además, un hook en un `.claude/settings.json` versionado obligaría a todos a tener el skill.
- **Sí:** la telemetría apagada (decisión del usuario, 2026-10-14). Reemplaza la decisión del 2026-10-13 de dejarla por defecto.
- **Sí:** `PRODUCT.md` y `DESIGN.md` versionados, en `apps/web` (decisión del usuario, 2026-10-14). Es donde impeccable trabaja sobre la web. El `PRODUCT.md` anterior se borró y se genera de nuevo en el paso 2, para que refleje el repo tal como está al empezar el spec. `docs/prd.md` sigue siendo la fuente de verdad del producto (CLAUDE.md).
- **No:** versionar `DESIGN.json`, el archivo auxiliar de `/impeccable document`. Es un artefacto de la herramienta; lo ignora `.git/info/exclude`, y Biome lo respeta.
- **Sí:** las reglas para módulos nuevos en `docs/base-visual.md`, no en `DESIGN.md` (decisión del usuario, 2026-10-14). `/impeccable document` puede reescribir `DESIGN.md`, y lo escrito a mano se perdería.
- **No:** reglas completas en `apps/web/CLAUDE.md`. Esa sección las resume y enlaza al documento, para no mantenerlas en dos lugares.
- **Sí:** la dirección visual la elige el usuario entre 2 o 3 propuestas sobre la bandeja (decisión del usuario, 2026-10-13). La bandeja es la pantalla más usada y la más exigente.
- **No:** fijar colores o tipografía en este spec. Los nombres de token sí se fijan; los valores, no.
- **Sí:** claro y oscuro según el sistema operativo (decisión del usuario, 2026-10-13), con `prefers-color-scheme`.
- **No:** un selector de tema, ni la clase `.dark`.
- **Sí:** escritorio y notebook, 1280 px o más (decisión del usuario, 2026-10-13). A 1024 px no se rompe, pero no se optimiza.
- **Sí:** paleta, componentes compartidos y galería (decisión del usuario, 2026-10-13).
- **Sí:** la galería solo en desarrollo. Es una referencia para quien programa, no una pantalla del producto.
- **Sí:** los componentes compartidos en `components/common/`, junto a `ConfirmDialog`. `packages/ui` se crea con la segunda app (CLAUDE.md).
- **Sí:** se conservan los nombres de token de shadcn, con `primary` como acento de marca. Los primitivos y `npx shadcn add` siguen funcionando sin tocar sus clases.
- **Sí:** 8 tonos de insignia con nombre de color. El SPEC 10 los usa como opciones: un admin entiende «Rojo», no «peligro».
- **Sí:** reglas escritas y un chequeo propio en `pnpm lint` (decisión del usuario, 2026-10-13). Es determinista y no descarga nada. Va en `lint`, que el CI corre siempre sobre todo el repo, y no en `test`, que se filtra por lo afectado. Con el hook apagado, es la única regla de diseño que se hace cumplir.
- **No:** el detector de impeccable en el CI. Descarga un binario en cada corrida, puede frenar PRs por reglas discutibles y obligaría a versionar el skill.
- **No:** un comentario de excepción en el chequeo. Un color nuevo pasa por `index.css`.
- **Sí:** `PRODUCT.md` completo, como lo arma impeccable (decisión del usuario, 2026-10-13).
- **Sí:** el nombre visible sigue siendo «system-syc» (decisión del usuario, 2026-10-13).
- **Sí:** el color por ítem en su propio spec, el 10, y las pantallas en el 11 (decisión del usuario, 2026-10-13). Cada PR toca una sola capa.
- **Sí:** fuentes autoalojadas con `@fontsource`. El servidor es on-premise, y la app no debe depender de un CDN externo.
- **Sí:** `culori` como dependencia de desarrollo para el test de contraste. Convertir `oklch` a sRGB a mano es propenso a errores.
- **No:** tocar `biome.json` ni `.dockerignore` (decisión del usuario, 2026-10-14): impeccable no se nombra en ninguna configuración compartida. Hace falta menos de lo que se pensaba:
  - Biome ya respeta `.git/info/exclude` por su `vcs.useIgnoreFile` (comprobado).
  - Los Dockerfiles copian solo `apps/` y `packages/`, así que `.claude/` y `.impeccable/` de la raíz no entran a ninguna imagen. Dentro de `apps/web`, `DESIGN.json` solo llegaría a la etapa de build, no a la imagen final.
- **No:** un chequeo de impeccable en `scripts/verify`, ni en el CI. El script nombraría a la herramienta en un archivo compartido. Lo de la instalación local se verifica a mano.
- **No:** documentar cómo instalar impeccable en `docs/` ni en `CLAUDE.md` (decisión del usuario, 2026-10-14). La lista de líneas del exclude queda en este spec (Feature 9.1).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Quien clone el repo no tiene `/impeccable`: no puede volver a auditar ni regenerar `DESIGN.md`, y el repo no le explica cómo instalarlo. | La regla que se hace cumplir (`check-design-tokens`) y las reglas escritas viven en el repo. `DESIGN.md` se puede editar a mano si hace falta. |
| `.git/info/exclude` es por clon: en un clon nuevo, o si se pierde, `git status` muestra los archivos de impeccable y se pueden commitear por error. | Los pasos 1 y 9 piden revisar `git status`, y el criterio de aceptación lo exige. La lista de líneas está en la Feature 9.1. |
| Un cambio futuro en los Dockerfiles (`COPY . .` desde la raíz) metería los archivos locales en una imagen. | Hoy copian solo `apps/` y `packages/`. Si eso cambia, quien lo cambie agrega la exclusión en `.dockerignore` en ese momento. |
| El instalador escribe los hooks en `.claude/settings.json`, que está versionado. | El paso 1 los quita y lo verifica. El criterio de aceptación y el verify revisan que `settings.json` no mencione impeccable. |
| Una actualización (`npx impeccable update`) vuelve a escribir los hooks o a encender la telemetría. | Después de cada actualización se repite la verificación del paso 1. |
| Los tokens nuevos cambian el aspecto de tickets y administración antes del SPEC 11, y queda una mezcla visual transitoria. | Se conservan los nombres de token de shadcn, así que nada se rompe, y los tests de esas pantallas tienen que pasar sin cambios. El SPEC 11 es el siguiente paso de UI. |
| `npx impeccable update` pisa cualquier edición local en `.claude/skills/impeccable/`. | Esos archivos no se editan a mano. Las reglas del proyecto viven en `docs/base-visual.md` y `apps/web/CLAUDE.md`. |
| `PRODUCT.md` repite partes de `docs/prd.md` y se desactualiza cuando el PRD cambia. | `CLAUDE.md` deja dicho que, ante una diferencia, manda el PRD. `/impeccable doctor` detecta desvíos, en las máquinas que lo tienen. |
| `DESIGN.md` lo genera una herramienta que no todos tienen, y puede quedar desactualizado respecto de `index.css`. | `index.css` y `tokens.contrast.test.ts` son la fuente de verdad de los valores. `DESIGN.md` se regenera al cerrar cada spec de UI. |
| El chequeo de colores da falsos positivos (un `#123` en un string que no es un color). | Ignora los comentarios y solo mira colores literales dentro de strings. Si aparece un caso legítimo, se ajusta el patrón en el script, no se agrega una excepción. |
| El tema oscuro duplica la verificación de contraste. | `tokens.contrast.test.ts` cubre los dos temas en cada corrida. |
| La implementación se detiene en el paso 3 esperando la elección del usuario. | Es intencional (Feature 9.2). Los pasos 1 y 2 quedan funcionando y se pueden commitear antes. |

## Qué **no** está en este spec

- El rediseño de las pantallas de tickets y administración (SPEC 11).
- El color por ítem en Estados y Prioridades (SPEC 10).
- Versionar el skill, los subagentes o `.impeccable/`.
- Los hooks de impeccable y su telemetría.
- Nombrar a impeccable en `biome.json`, `.dockerignore` o `.gitignore`, o documentar su instalación en el repo.
- La adaptación a tablet y celular.
- Un selector manual de tema.
- El detector de impeccable en el CI.
- Logo, identidad institucional o un cambio de nombre.
- impeccable para otras herramientas.
- `packages/ui`.

Cada uno, si hace falta, va en su propio spec.
