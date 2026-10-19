# SPEC 09 — Sistema visual

> **Status:** In progress — etapa 9.1 (tema) implementada, 9.2 (login) implementada, 9.3 (layout) implementada, 9.4 (bandeja) implementada, 9.5 (formulario y detalle) implementada; 9.6 pendiente
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
| 9.4 | Bandeja de tickets; color de estados y prioridades (las tarjetas de resumen quedan para una etapa aparte) | Hecha |
| 9.5 | Formulario y detalle de ticket (secciones de color, pestañas, comentarios e historial) | Hecha |
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

## Etapa 9.4 — Bandeja de tickets

Referencia: `TICKETS EXTERNOS: LISTA` de `docs/Maqueta-Dashboard/Main.dc.html`. Rediseña `/tickets` (`TicketsList`, `TicketsFilters`, `TicketsTable`); la API, los contratos y la URL (búsqueda, filtros y página) no cambian.

### Alcance

**Dentro:**

- **Encabezado.** «Tickets» en `font-heading` 36px, la bajada «Seguimiento de solicitudes y su estado.» y el botón «Nuevo ticket» con un «+». La bandeja se centra con un ancho máximo de 1200px.
- **Listado en una tarjeta** (borde, radio 12px, fondo `--background`) con tres partes: la barra de filtros, la tabla y el pie de paginación.
- **Barra de filtros.**
  - Fila principal: búsqueda con lupa, Estado, Prioridad, Departamento (solo el admin), «Más filtros» y «Limpiar filtros». La etiqueta de cada selector va a su izquierda.
  - «Más filtros (N)» despliega Área, Tipo de área, Edificio, Tipo, Proveedor, Módulo y las dos fechas de recepción; N es la cantidad de esos filtros que están activos. Arranca plegado, salvo que la URL ya traiga alguno de ellos.
  - Los filtros, la búsqueda con pausa de 300 ms y la página siguen viviendo en la URL, igual que hoy.
- **Tabla.** Cabecera en `--muted`; filas de 56px con separador `--line-soft`. El **número** (`TE-000013`) es el enlace al ticket, en `font-mono` y `--link`; el título es texto. El **estado** va en una píldora con un punto de color y la **prioridad** con un punto y su nombre. Las columnas son las de hoy (Número, Título, Departamento, Estado, Prioridad, Área, Fecha de recepción).
- **Pie.** «Mostrando 21–40 de 134 · Página 2 de 7» y los botones «Anterior» y «Siguiente» de 40px, que siguen siendo enlaces (el deshabilitado, un botón).
- **Color de estados y prioridades**, derivado en la web (ver más abajo).

**Fuera:**

- Las **tarjetas de resumen** (Pendientes, En progreso, Finalizados, Alta y urgente). Piden conteos que la API no entrega y una definición de «pendiente» que los estados editables no dan. Se hacen en una etapa aparte, con su propio SPEC.
- La columna «Acciones» (editar y eliminar desde la fila): el sistema edita y elimina desde el detalle del ticket.
- El aviso con «Deshacer» de la maqueta: el sistema no deshace.
- El formulario y el detalle (9.5) y los cambios en la API, los contratos y la base.

### Color de estados y prioridades

Se calcula en `features/tickets/ticket-colors.ts` a partir de los catálogos que ya trae `useCatalog` (que vienen en el orden de la administración). No se guarda nada en la base.

| Estado | Punto |
|---|---|
| `FINALIZADO` | lleno, `--foreground` |
| `CERRADO` | aro de `--neutral-dot` |
| `CANCELADO` | lleno, `--neutral-dot` |
| `REABIERTO` | lleno, `--brand` |
| Sin clave (los que crea el admin) | por su posición entre los estados sin clave: 1.º aro de `--foreground`, 2.º `--teal`, 3.º `--amber`, 4.º `--blue`, 5.º `--violet`; del 6.º en adelante vuelve a empezar |

| Prioridad | Punto |
|---|---|
| La última del catálogo (la más urgente) | `--destructive` |
| La anterior | `--brand` |
| La que le precede | `--warning` |
| Las demás | `--neutral-dot` |

Con una sola prioridad el punto es neutro. El nombre siempre acompaña al punto: el color no es la única señal. El catálogo de prioridades tiene que estar ordenado de la menos a la más urgente (así viene del seed: Baja, Media, Alta, Urgente); el admin lo controla con las flechas de la pantalla de catálogos. Mientras el catálogo carga, o si el ítem no está en él (un estado eliminado), el punto es neutro.

### Decisiones

- **Color derivado, no guardado.** Se eligió derivarlo en la web antes que agregar un color a cada estado y prioridad (migración, API y selector en el ABM, como la rama `spec-10`). Costo: el admin no elige el color; si reordena un catálogo, los colores siguen la posición. Si molesta, se hace el color guardado en una etapa aparte.
- **El número es el enlace**, como en la maqueta, y el título pasa a texto. Antes era al revés. Así hay un solo enlace por fila y el título largo ya no se parte como enlace.
- **La variante `link` de `Button` usa `--link`**, no `--primary`. El primario sirve de fondo de botón pero sobre el fondo oscuro da 3,5:1 como texto; `--link` llega a 7,9:1. Lo usa «Ir a la página 1» y cualquier enlace-botón futuro.
- **«Más filtros» arranca plegado** para que la fila principal quede corta. Un enlace compartido con un filtro secundario activo lo abre solo, para que no haya filtros activos escondidos.

### Criterios de aceptación (9.4)

- [x] **09.16** El color de cada estado y de cada prioridad sale de las tablas de arriba: las claves de sistema, la posición entre los estados sin clave (con vuelta al 6.º), las prioridades desde la última, y neutro si el catálogo no cargó o el ítem no está.
- [x] **09.17** La fila muestra el número como único enlace al ticket, el estado en una píldora con su punto y la prioridad con su punto y su nombre; el orden de las filas es el de la API.
- [x] **09.18** La barra de filtros tiene la fila principal (y Departamento solo para el admin); «Más filtros» muestra N, despliega los otros seis filtros y las fechas, y arranca abierto si la URL trae alguno.
- [x] **09.19** Los filtros, la búsqueda con pausa y «Limpiar filtros» siguen funcionando contra la URL, con los mismos resultados que antes.
- [x] **09.20** El pie muestra «Mostrando a–b de N · Página p de n» y «Anterior»/«Siguiente» como enlaces que conservan los filtros (o botones deshabilitados en los extremos).
- [x] **09.21** El encabezado ofrece «Nuevo ticket» y la bandeja conserva sus estados: cargando, error con «Reintentar», sin resultados con «Limpiar filtros», vacía y página inexistente.

A mano (revisado el 2026-10-19 con el admin de desarrollo, con capturas en claro, oscuro y 700px de ancho): bandeja con un ticket, página inexistente y filtro secundario en la URL. Falta recorrerla con un agente y con varios tickets de distintos estados y prioridades (la base de desarrollo tiene uno solo); la lógica de color está cubierta por tests.

## Etapa 9.5 — Formulario y detalle de ticket

Referencia: `TICKETS: ALTA / EDICIÓN` de `docs/Maqueta-Dashboard/Main.dc.html`. Rediseña `/tickets/nuevo` (`CreateTicketForm`) y `/tickets/$ticketId` (`TicketDetail`, `TicketForm`, `TicketComments`, `TicketHistory`). Los campos, las reglas, los mensajes de error, los diálogos de estado y departamento, el bloqueo optimista y la protección contra salir con cambios sin guardar no cambian.

### Alcance

**Dentro:**

- **Secciones de color** (`FormSection`): tarjeta con una franja de 4px arriba en el color de la sección, fondo y borde teñidos, un ícono en un cuadro de 40px, título de 18px y una línea de descripción. Los colores salen de los tokens: Datos del ticket `--brand`, Clasificación `--amber`, Proveedor `--violet`, Solución y seguimiento `--teal`, Comentarios `--blue`, Historial `--amber`.
- **Etiquetas con ícono** en el color de la sección, el asterisco de obligatorio en `--brand`, contador `n/200`, `n/5000` y `n/2000` junto a los campos de texto largo y «Usar hoy» junto a la fecha de recepción.
- **Alta** (`/tickets/nuevo`): título «Nuevo ticket», la bajada «Completá los datos del requerimiento. Los campos con * son obligatorios.» y dos secciones: «Datos del ticket» (actuación simple y departamento en la primera fila, título, prioridad, fecha de recepción, descripción) y «Proveedor» (proveedor y referencia externa). Sin clasificación: se completa al editar (SPEC 05, Feature 5.1). El agente ve su departamento de solo lectura y con un candado; el admin lo elige.
- **Edición** (`/tickets/$ticketId`): encabezado con el número y el título, el estado y el departamento, y las acciones «Cambiar estado», «Cambiar departamento» y «Eliminar»; debajo, **pestañas** «Datos», «Comentarios» e «Historial», cada una con su punto de color y una raya de 3px del mismo color en la activa. «Datos» tiene cuatro secciones (Datos del ticket, Clasificación, Proveedor, Solución y seguimiento). Las fechas de cierre y de reapertura, cuando el ticket ya las tiene, van en un recuadro dentro de «Datos del ticket».
- **Barra de acciones fija** al pie del formulario: «Cancelar» y «Crear ticket» en el alta; «Descartar cambios» y «Guardar cambios» en la edición. A la izquierda lleva el aviso «Cambios guardados.» o el error del servidor (con «Recargar» si el ticket cambió).
- **Comentarios:** la lista como conversación, con un avatar de iniciales y un globo por comentario; el formulario de «Nuevo comentario» con contador y el botón «Comentar».
- **Historial:** la línea de tiempo con una raya izquierda de 3px en el color de la sección.
- **Prioridad con su punto de color** dentro del selector (el mismo color que en la bandeja, 9.4).
- Anchura: el contenido se centra con un máximo de 1200px, como la bandeja.

**Fuera:**

- El selector de estado de la maqueta: el estado se sigue cambiando con el diálogo «Cambiar estado», que valida las fechas de cierre y reapertura. Tampoco hay selector de departamento en la edición (ídem «Cambiar departamento»).
- El color de foco por sección: el foco usa el token `--ring` en todo el sistema.
- Los diálogos de estado, departamento y eliminación (se rediseñan con el resto de los diálogos, en 9.6), y todo cambio en la API, los contratos o la base.

### Decisiones

- **Pestañas sin desmontar.** Los tres paneles quedan montados y los inactivos ocultos: cambiar de pestaña no pierde lo escrito en el formulario ni en el comentario a medio escribir.
- **El título del encabezado sigue siendo «TE-000013 · título»**, no «Editar ticket» como en la maqueta: identifica el ticket de un vistazo, y la bajada trae las instrucciones.
- **El aviso «Cambios guardados.»** se ve en la barra fija, y además una región `role="status"` invisible, siempre montada y fuera del formulario, lo anuncia a los lectores de pantalla (el formulario se vuelve a montar al guardar y una región recién creada no siempre se anuncia).
- **Etiquetas de la maqueta:** «Tipo» pasa a «Tipo de ticket», «Solución» a «Descripción de la solución» y «Se notificó al usuario» a «Notificado», con su explicación al lado.
- **Estado y departamento, de solo lectura en la edición.** El formulario los muestra (con un candado el departamento, con su punto el estado) para que la pantalla se parezca a la maqueta, pero no forman parte de lo que se envía: se siguen cambiando con sus diálogos.
- **El selector de prioridad muestra su punto de color**, con el valor pegado a él y la flecha a la derecha (`leading` en `CatalogOptionSelect`).
- **Voseo** («Completá», «Elegí»), como en el resto de la aplicación.

### Criterios de aceptación (9.5)

- [x] **09.22** El alta muestra las dos secciones con sus campos, los contadores y «Usar hoy»; el admin elige el departamento y el agente lo ve de solo lectura; valida y envía como antes y navega al ticket creado.
- [x] **09.23** La edición muestra las cuatro secciones de «Datos» con sus campos, las fechas de cierre y reapertura solo si el ticket ya las tiene, y guarda, descarta y avisa del conflicto (409) como antes.
- [x] **09.24** Las pestañas Datos, Comentarios e Historial cambian de panel con el mouse y las flechas, y no desmontan los otros paneles (lo escrito en el formulario se conserva).
- [x] **09.25** La barra fija tiene las acciones de cada formulario, con «Guardar cambios» y «Descartar cambios» deshabilitados sin cambios, y muestra el aviso de guardado y los errores del servidor.
- [x] **09.26** El encabezado muestra número y título, estado y departamento; «Cambiar estado» y «Cambiar departamento» se deshabilitan con cambios sin guardar; «Cambiar departamento» y «Eliminar» son solo del admin.
- [x] **09.27** Los comentarios se ven como conversación con avatar y globo; comentar valida, envía y limpia; solo el admin elimina.
- [x] **09.28** El historial muestra cada movimiento con su fecha, su autor y sus cambios, del más reciente al más antiguo.
- [x] **09.29** La prioridad muestra su punto de color dentro del selector, con la misma regla que la bandeja.

A mano (revisado el 2026-10-19 con el admin de desarrollo, con capturas de la pantalla de alta, el detalle y las tres pestañas en claro y oscuro, y del alta a 430px de ancho): falta recorrerlo con un agente y probar guardar con cambios, el conflicto 409 y un comentario real. Los tests cubren esos casos.

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
