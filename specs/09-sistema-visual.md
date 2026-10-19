# SPEC 09 — Sistema visual

> **Status:** In progress — etapa 9.1 (tema) implementada, 9.2 (login) implementada, 9.3 (layout) implementada; 9.4 a 9.6 pendientes
> **Depends on:** SPEC 02 (login), SPEC 05 y 06 (tickets y bandeja), SPEC 04 y 08 (catálogos)
> **Date:** 2026-10-16
> **Objective:** llevar al proyecto el diseño de la maqueta de Claude Design (`docs/Maqueta-Dashboard/`): primero la paleta, la tipografía, los radios y las sombras, definidos en un solo lugar; después, pantalla por pantalla.

## Por qué existe este spec

La maqueta cubre toda la app (login, bandeja, formulario y detalle de ticket, departamentos, usuarios y catálogos) con claro y oscuro. Implementarla de una vez mezclaría decisiones de tema con decisiones de cada pantalla. Se hace por etapas, y la primera deja el tema fijo para que ninguna pantalla vuelva a decidir un color.

La maqueta es una **referencia**, no código de producción: sus valores (colores, tamaños, radios, sombras) se replican con los componentes de `apps/web/src/components/ui` y los tokens de shadcn. No se copia su HTML ni su runtime.

Decisiones del usuario del 2026-10-16:

- El botón principal usa **`#a9583e`** con texto blanco. `#cc785c` (3,3:1 con blanco, no llega a AA) queda como acento de marca.
- Las ramas `spec-09-base-visual-impeccable`, `spec-10-color-estados-prioridades`, `spec-11-rediseno-tickets-administracion` y `main-impeccable` (otro rediseño) se ignoran. Se parte de `main`.
- Este SPEC crece por etapas: cada pantalla se agrega como una sección cuando arranca.

## Etapas

| Etapa | Contenido | Estado |
|---|---|---|
| 9.1 | Tema: tokens de color, tipografías, radio, sombras y regla de uso | Hecha |
| 9.2 | Login: panel de marca, logo «system·syc», interruptor claro/oscuro con persistencia (`.dark` en `<html>`) | Hecha |
| 9.3 | Layout autenticado: sidebar y topbar | Hecha |
| 9.4 | Bandeja y tarjetas KPI; color de estados y prioridades | Pendiente |
| 9.5 | Formulario y detalle de ticket (secciones de color, pestañas) | Pendiente |
| 9.6 | Administración: departamentos, usuarios y catálogos | Pendiente |

Las etapas 9.2 a 9.6 se detallan (alcance, criterios) cuando arranca cada una. Cada etapa se implementa y se revisa antes de la siguiente.

## Etapa 9.1 — Tema

### Alcance

**Dentro:**

- `apps/web/src/index.css`: valores de las variables de shadcn en `:root` y `.dark`, tokens nuevos (también en `@theme inline`), sombras y las cuatro tipografías.
- Fuentes alojadas con `@fontsource` (el despliegue es on-premise por IP: sin Google Fonts).
- `HealthIndicator`, el único componente con colores de Tailwind fijos, pasa a tokens.
- La regla de uso en `apps/web/CLAUDE.md`.
- La maqueta se versiona en `docs/Maqueta-Dashboard/` y Biome la excluye.

**Fuera:** rediseñar cualquier pantalla, el logo, el interruptor de tema (9.2), el color por estado y prioridad atado a los catálogos (9.4), y cualquier cambio en API, contratos o base.

### Tokens

Mapeo de la maqueta a las variables de shadcn (hex, como en la maqueta):

| Variable | Claro | Oscuro |
|---|---|---|
| `--background`, `--sidebar` | `#faf9f5` | `#181715` |
| `--popover` | `#faf9f5` | `#252320` |
| `--foreground`, `--card-foreground`, `--popover-foreground`, `--secondary-foreground`, `--accent-foreground` | `#141413` | `#faf9f5` |
| `--card`, `--secondary` | `#efe9de` | `#252320` |
| `--muted`, `--accent` | `#f5f0e8` | `#1f1e1b` |
| `--muted-foreground` | `#6c6a64` | `#a09d96` |
| `--primary`, `--sidebar-primary` | `#a9583e` | `#a9583e` |
| `--primary-foreground` | `#ffffff` | `#ffffff` |
| `--destructive` | `#b73a3a` | `#ef8a85` |
| `--border`, `--input` | `#e6dfd8` | `#34322d` |
| `--ring` | `#cc785c` | `#cc785c` |
| `--success` (texto de confirmación, AA) | `#287a69` | `#5db8a6` |
| `--chart-1..5` | `#2f8f7c #a86a0f #3f78b5 #7156b0 #c2410c` | `#5db8a6 #e8a55a #7aa8d8 #b39ddb #fb923c` |
| `--radius` | `0.5rem` | — |

Tokens nuevos (la maqueta los usa y shadcn no los tiene):

| Token | Uso | Claro | Oscuro |
|---|---|---|---|
| `--body` | texto corrido (títulos y etiquetas usan `--foreground`) | `#3d3d3a` | `#d4d1c9` |
| `--brand` | acento de marca: logo, campo obligatorio, foco | `#cc785c` | `#cc785c` |
| `--link` | número de ticket clickeable | `#c2410c` | `#fb923c` |
| `--line-soft` | borde de recuadros informativos | `#ebe6df` | `#2a2825` |
| `--feature`, `--feature-foreground`, `--feature-muted` | tarjeta KPI destacada (invertida) | `#181715 #faf9f5 #a09d96` | `#faf9f5 #141413 #6c6a64` |
| `--teal`, `--amber`, `--blue`, `--violet` | color de cada sección del formulario, pestañas e interruptor | `#2f8f7c #a86a0f #3f78b5 #7156b0` | `#5db8a6 #e8a55a #7aa8d8 #b39ddb` |
| `--warning` | advertencia y prioridad media | `#d4a017` | `#d4a017` |
| `--scrim` | fondo detrás de los diálogos | `rgb(20 20 19 / 0.4)` | `rgb(0 0 0 / 0.6)` |
| `--neutral-dot` | punto gris de estados y prioridades sin color propio | `#8e8b82` | `#8e8b82` |

Sombras: `--shadow-dialog` (`0 12px 32px rgb(20 20 19 / 0.2)`) y `--shadow-focus` (`0 0 0 3px rgb(204 120 92 / 0.15)`).

### Tipografía

| Rol | Familia | Token | Paquete |
|---|---|---|---|
| Texto | Inter | `font-sans` | `@fontsource-variable/inter` |
| Títulos (h1 36px, diálogos 28px, KPI 44px) | Cormorant Garamond 500 | `font-heading` | `@fontsource/cormorant-garamond` |
| Número de ticket | JetBrains Mono | `font-mono` | `@fontsource-variable/jetbrains-mono` |
| Logo | Bricolage Grotesque | `font-brand` | `@fontsource-variable/bricolage-grotesque` |

Reemplaza a Geist, que se quita.

### Regla de uso

Los componentes usan solo tokens (`bg-background`, `text-body`, `bg-primary`, `text-link`, `bg-feature`…). Nada de hex, `rgb()`, `oklch()` ni colores de la paleta de Tailwind. Un color que falta se agrega como token (en `:root`, en `.dark` y en `@theme inline`). Detalle en `apps/web/CLAUDE.md`, sección «Sistema visual».

### Criterios de aceptación (9.1)

`pnpm verify --spec 09` los chequea (estáticos, sin API ni base):

- [x] **09.1** `index.css` define cada token de la maqueta en `:root` y en `.dark`, y no hay uno solo en claro.
- [x] **09.2** Cada token se expone a Tailwind en `@theme inline` como `--color-*`.
- [x] **09.3** `--primary` con `--primary-foreground` da al menos 4,5:1 (AA).
- [x] **09.4** Ningún `.ts`/`.tsx` de `apps/web/src` usa hex, `rgb()`/`oklch()` ni colores de la paleta de Tailwind.
- [x] **09.5** Las cuatro fuentes están en `package.json` y se importan en `index.css`; Geist ya no está y no se carga nada de Google.

A mano, con `docker compose up`: el login y `/tickets` toman el fondo `#faf9f5`, los botones `#a9583e` y los títulos salen en Cormorant; con la clase `dark` en `<html>`, el fondo pasa a `#181715`.

## Etapa 9.2 — Login

Referencia: la sección `LOGIN` de `docs/Maqueta-Dashboard/Main.dc.html`.

### Alcance

**Dentro:**

- **Disposición.** Dos paneles: el de marca (`--muted`, ancho 5/11) y el del formulario (`--background`, 6/11). Debajo de 960px se apilan, sin la línea de corte. El de marca lleva, centrados, el logo y «Gestión interna y seguimiento de tickets.» (18px, `--muted-foreground`). Entre los dos paneles va una línea de corte discontinua con una muesca arriba y otra abajo, a modo de ticket partido.
- **Logo «system·syc»** (`components/common/Logo.tsx`): dos piezas con muescas en las esquinas, una de tinta (`--foreground`) y otra de acento (`--brand`) encastrada, en `font-brand` 800. Tamaño por la altura (`--h`, 72px en el login). Es `role="img"` con `aria-label="system-syc"`.
- **Formulario.** Sin tarjeta. Título «Iniciar sesión» en `font-heading` 36px y la bajada «Ingresá con tu usuario y contraseña.». Campos de 40px de alto, radio 8px, texto de 16px y etiqueta de 13px. La contraseña tiene un botón «Mostrar»/«Ocultar» dentro del campo. El error de cada campo sale debajo en `--destructive`, con el borde del campo también en `--destructive`. El botón «Ingresar» ocupa todo el ancho y, mientras envía, pasa a «Ingresando…» deshabilitado. Al pie, separada por una línea discontinua: «¿No tenés acceso? Un administrador da de alta a cada usuario.».
- **Aviso de error** (`role="alert"`, borde `--destructive`): un título y un detalle. «Usuario o contraseña incorrectos.» con «Revisá los datos e intentá de nuevo.»; «Tu usuario está desactivado.» con «Pedí a un administrador que lo reactive.»; «Demasiados intentos.» con «Esperá un minuto antes de volver a intentar.»; «No se pudo conectar con el servidor.», sin detalle.
- **Interruptor claro/oscuro** (`components/common/ThemeToggle.tsx`, lógica en `lib/theme.ts`). Un botón redondo de 40px, arriba a la derecha del panel del formulario, con la luna en claro y el sol en oscuro. La clase `dark` en `<html>` es la única fuente de verdad. La elección se guarda en `localStorage` (clave `syc-theme`); sin elección previa se usa `prefers-color-scheme`. `main.tsx` la aplica antes de renderizar, para no parpadear. Si `localStorage` no está disponible, el interruptor igual funciona en esa sesión.
- Token nuevo `--brand-foreground` (`#ffffff` en los dos temas): el texto de la pieza de acento del logo.

**Fuera:** el layout autenticado (9.3, donde el interruptor se reutiliza en la barra superior), cambiar los tamaños de los primitivos de `components/ui` (el login fija los suyos con `className`; se alinean a la maqueta cuando una etapa lo necesite), el flujo de autenticación y los textos de los demás errores.

Se mantiene el voseo del proyecto («Ingresá», «Revisá»); la maqueta está en tuteo.

### Criterios de aceptación (9.2)

- [x] **09.6** El login muestra el logo, el título y los campos; el envío vacío marca los dos campos y no llama a la API; el envío completo manda `{ username, password }`.
- [x] **09.7** Cada fallo (`invalid`, `rate-limited`, `disabled`, `unreachable`) muestra su aviso con título y detalle.
- [x] **09.8** «Mostrar»/«Ocultar» alterna el tipo del campo de contraseña y su etiqueta accesible.
- [x] **09.9** El interruptor pone o saca la clase `dark` de `<html>`, guarda la elección, la restaura al iniciar y cae en `prefers-color-scheme` sin elección o con `localStorage` roto.
- [x] **09.10** `main.tsx` aplica el tema antes de renderizar; `routes/login.tsx` usa el layout del login.

A mano (revisado el 2026-10-19 con capturas en 1440×900 y 400px de ancho): en el login, claro y oscuro con el interruptor; al recargar se conserva; por debajo de 960px los paneles se apilan; el logo se ve nítido en los dos temas.

## Etapa 9.3 — Layout autenticado

Referencia: `SIDEBAR` y `TOPBAR` de `docs/Maqueta-Dashboard/Main.dc.html`. Es el marco de todas las pantallas autenticadas; el contenido de cada una se rediseña en 9.4 a 9.6.

### Alcance

**Dentro:**

- **Disposición** (`AppShell`). Barra lateral de 248px a la izquierda y, a su derecha, la barra superior sobre el contenido (padding de 32px). Por debajo de 808px la barra lateral pasa arriba, a todo el ancho, y el contenido queda debajo.
- **Barra lateral** (`Sidebar`). Fondo `--background` con borde derecho. Arriba, el `Logo` de 40px. Debajo, la sección «Módulos» con «Tickets» y, solo para el admin, la sección «Administración» con «Departamentos», «Usuarios» y «Catálogos». Cada entrada es un enlace de 40px con ícono de 18px (`lucide`); la activa lleva `--card` y `--foreground`, y las demás `--muted-foreground`. Los títulos de sección van en 12px, mayúsculas y con 1,5px de separación entre letras.
- **Submenú de catálogos.** «Catálogos» es un botón que despliega los 8 catálogos, en el orden de `CATALOG_KINDS`; cada uno enlaza a `/admin/catalogos?catalogo=<ruta>` y el catálogo abierto queda marcado. Fuera de los catálogos, el botón lleva al primero; dentro, pliega y despliega el submenú. Las pestañas de `CatalogsAdmin` siguen hasta la etapa 9.6, que las reemplaza.
- **Tarjeta «Próximamente»** al pie, oscura en los dos temas (tokens `--note-*`), y debajo, el `HealthIndicator` que ya estaba.
- **Barra superior** (`Topbar`). Alto mínimo de 64px, con borde inferior. A la izquierda, las migas de pan «Módulos / Tickets», «Tickets / Nuevo ticket», «Tickets / Detalle del ticket», «Administración / Departamentos», «Administración / Usuarios» y «Catálogos / <catálogo>». A la derecha: el `ThemeToggle` de 9.2, el avatar con las iniciales y el nombre del usuario, y dos botones redondos de 40px con ícono, «Cambiar mi contraseña» (candado) y «Cerrar sesión».
- Token nuevo: `--note`, `--note-foreground`, `--note-muted` y `--note-border` (la tarjeta «Próximamente»).

**Fuera:** el contenido de las pantallas (9.4 a 9.6), el rediseño del diálogo de cambio de contraseña, el contador de tickets en la barra lateral y las rutas nuevas.

### Decisiones

- **Sin «Tickets internos».** La maqueta tiene dos módulos de tickets; el sistema solo tiene uno. «Tickets externos» pasa a llamarse «Tickets» y no se agrega «Tickets internos»: la tarjeta «Próximamente» ya anticipa los módulos que vengan.
- **El avatar muestra el nombre del usuario**, no el rol (la maqueta pone «Administrador»/«Agente»). Las iniciales salen de las dos primeras palabras del nombre.
- **Una sola «página actual».** TanStack Router pone `aria-current="page"` a todo enlace que considera activo y no se puede evitar desde afuera. Por eso el logo apunta a `/` (que redirige a los tickets y nunca figura como activo) y «Catálogos» es un botón y no un enlace: así queda marcado un solo enlace en la barra lateral, el de la página donde está el usuario.
- **Migas de pan de «Catálogos»:** como `/admin/catalogos` siempre abre un catálogo concreto (el primero si no hay otro en la URL), la miga es «Catálogos / <catálogo>», sin la vista general que la maqueta tiene.
- El apilado por debajo de 808px es fiel a la maqueta, pero deja un menú alto sobre el contenido en un teléfono. El sistema se usa en escritorio; si molesta, se cambia por un menú plegable en una etapa posterior.

### Criterios de aceptación (9.3)

- [x] **09.11** La barra lateral muestra «Tickets» a todos y «Administración» (con sus tres enlaces) solo al admin; el catálogo abierto queda marcado y la página actual lleva `aria-current="page"`.
- [x] **09.12** «Catálogos» despliega los 8 catálogos solo dentro de `/admin/catalogos`, cada uno con su enlace.
- [x] **09.13** Las migas de pan de cada ruta son las de la lista de arriba.
- [x] **09.14** La barra superior muestra el avatar con las iniciales y el nombre, el interruptor de tema, «Cambiar mi contraseña» y «Cerrar sesión» (que llama al cierre de sesión y se deshabilita mientras corre).
- [x] **09.15** Ningún componente del layout usa colores sueltos (lo cubre el 09.4) y la tarjeta «Próximamente» usa los tokens `--note-*`.

A mano (revisado el 2026-10-19 con el admin de desarrollo, con capturas en claro, oscuro y 700px de ancho): recorrer Tickets, Departamentos, Usuarios y los catálogos; claro y oscuro; achicar la ventana por debajo de 808px. Falta recorrerlo con un agente (la prueba automática ya cubre que no ve «Administración»).

## Decisiones

- **Primario AA.** El botón usa `#a9583e` (5,06:1 con blanco) y no `#cc785c` (3,28:1), porque el proyecto ya respeta AA. `#cc785c` es `--brand`: no lleva texto blanco encima.
- **`--success` ≠ `--teal`.** El texto de confirmación usa `#287a69` (4,89:1 sobre el fondo claro). El teal de la maqueta (`#2f8f7c`, 3,73:1) queda para uso decorativo.
- **Sin Google Fonts.** La maqueta las pide a Google; el servidor es on-premise y el despliegue no depende de internet.
- **Ramas `*-impeccable` ignoradas.** Son otro rediseño; no se mezclan.
- **Colores de estado y prioridad: en 9.4.** La maqueta los mapea por id (`STATE_DOT[1..7]`, `PRIO_DOT[1..4]`), que no sirve con catálogos editables. 9.1 solo deja los tokens (`--teal`, `--amber`, `--warning`, `--neutral-dot`, `--brand`, `--destructive`); cómo se asigna uno a cada estado o prioridad se resuelve en la bandeja.

## Riesgos

- El oscuro de la maqueta no cambia `--primary`: `#a9583e` sobre `#181715` da 3,5:1: alcanza para el borde o el fondo de un botón (3:1), no para texto. El botón lleva texto blanco (AA); `--primary` no se usa como color de texto. Para texto de acento se usa `--link`.
- `--warning` (`#d4a017`) es un fondo de punto o de ícono: sobre el fondo claro da 2,3:1, no sirve como texto.

## Qué **no** está en este spec

Cambios de API, contratos o base de datos; un tema editable por el usuario; el logo y el interruptor claro/oscuro (9.2).
