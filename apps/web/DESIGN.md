---
name: system-syc
description: "Una bandeja de trabajo cálida y editorial: lienzo crema, títulos en serif y un solo coral, con el color y el borde haciendo todo el trabajo."
colors:
  canvas-cream: "#faf9f5"
  cream-soft: "#f5f0e8"
  cream-card: "#efe9de"
  cream-strong: "#e8e0d2"
  ink-warm: "#141413"
  ink-muted: "#6c6a64"
  hairline: "#e6dfd8"
  field-line: "#cfc7b8"
  clay-coral: "#a9583e"
  clay-coral-pressed: "#8f4127"
  coral-focus: "#cc785c"
  success-green: "#167b39"
  warning-ochre: "#936100"
  info-teal: "#0f7a6a"
  error-brick: "#b33335"
  night: "#181715"
  night-card: "#1f1e1b"
  night-elevated: "#252320"
  on-night: "#faf9f5"
  on-night-soft: "#a09d96"
  tono-gris: "#efece8"
  tono-gris-text: "#4e473a"
  tono-gris-border: "#cfcac1"
  tono-rojo: "#ffe5e1"
  tono-rojo-text: "#742e29"
  tono-rojo-border: "#efbcb6"
  tono-naranja: "#ffe7da"
  tono-naranja-text: "#713408"
  tono-naranja-border: "#ecc0a8"
  tono-amarillo: "#f4edd5"
  tono-amarillo-text: "#5b4500"
  tono-amarillo-border: "#d8ca9e"
  tono-verde: "#dff3e2"
  tono-verde-text: "#115629"
  tono-verde-border: "#b0d6b6"
  tono-azul: "#ddefff"
  tono-azul-text: "#124a7b"
  tono-azul-border: "#aecef1"
  tono-violeta: "#f2e8ff"
  tono-violeta-text: "#543772"
  tono-violeta-border: "#d3c1eb"
  tono-rosa: "#ffe4ee"
  tono-rosa-text: "#6f2d4a"
  tono-rosa-border: "#ecbbcc"
typography:
  display:
    fontFamily: "Cormorant Garamond Variable, EB Garamond, Times New Roman, serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 500
    lineHeight: 1.375
    letterSpacing: "normal"
  body:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "normal"
  caption:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  section-label:
    fontFamily: "Inter Variable, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.33
    letterSpacing: "0.025em"
  code:
    fontFamily: "JetBrains Mono Variable, ui-monospace, monospace"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
rounded:
  sm: "5px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.clay-coral}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  button-primary-pressed:
    backgroundColor: "{colors.clay-coral-pressed}"
    textColor: "#ffffff"
  button-outline:
    backgroundColor: "{colors.canvas-cream}"
    textColor: "{colors.ink-warm}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.cream-card}"
    textColor: "{colors.ink-warm}"
    typography: "{typography.label}"
    rounded: "{rounded.lg}"
    padding: "0 12px"
    height: "36px"
  input:
    backgroundColor: "{colors.canvas-cream}"
    textColor: "{colors.ink-warm}"
    typography: "{typography.body}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "36px"
  badge:
    backgroundColor: "{colors.cream-card}"
    textColor: "{colors.ink-warm}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    height: "24px"
  badge-tono-verde:
    backgroundColor: "{colors.tono-verde}"
    textColor: "{colors.tono-verde-text}"
    typography: "{typography.caption}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
    height: "24px"
  card:
    backgroundColor: "{colors.canvas-cream}"
    textColor: "{colors.ink-warm}"
    rounded: "{rounded.xl}"
    padding: "16px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.ink-warm}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  nav-link-active:
    backgroundColor: "{colors.cream-strong}"
    textColor: "{colors.ink-warm}"
  page-header:
    textColor: "{colors.ink-warm}"
    typography: "{typography.display}"
---

# Design System: system-syc

## Overview

**Creative North Star: "La mesa de entradas"**

system-syc es el mostrador donde cada requerimiento entra, se asienta y queda registrado. Por eso la interfaz se siente como un mostrador ordenado: un lienzo crema tibio en lugar del gris frío de las herramientas de tickets, títulos en una serif editorial y un único coral que marca dónde se actúa. Es trabajo de oficina hecho con oficio: calmo, preciso, sin adornos, pensado para una tarea que se repite todo el día.

El color y el borde hacen todo el trabajo. No hay sombras decorativas ni efectos al pasar el mouse sobre los botones; la profundidad sale de un escalón de crema a otro y de un filete de 1 px. El estado de un ticket nunca viaja solo en color: siempre lleva su texto. Y el tema sigue al sistema operativo, claro u oscuro, sin selector.

La base está pensada para crecer: es una cáscara para módulos que todavía no existen. Una pantalla nueva reutiliza `Page`, `PageHeader` y los tres estados, y toma sus colores solo de tokens.

**Key Characteristics:**
- Lienzo crema (#faf9f5) con tinta cálida (#141413); nunca blanco puro ni gris frío.
- Un único acento, el coral, reservado a la acción principal y al foco.
- Serif (Cormorant Garamond, peso 500) solo para el título de cada pantalla; todo lo demás en Inter.
- Plano por defecto: color y borde de 1 px en lugar de sombras.
- Contraste AA (4,5:1) en cada texto y cada tono, en los dos temas, verificado por un test.
- Controles de 36 px, radios de 8 px en campos y botones y de 12 px en tarjetas y diálogos.

## Colors

Una paleta cálida de crema y tinta con un solo coral; el verde, el ocre, el verde azulado y el ladrillo existen solo para los estados.

### Primary
- **Coral de arcilla** (#a9583e): la acción principal y el enlace. Es el coral «activo» de la definición de origen; el coral más claro (#cc785c) no da contraste suficiente con texto blanco (3,3:1), así que ese tono queda para el anillo de foco y para el tema oscuro.
- **Coral pulsado** (#8f4127): el botón primario mientras se presiona.
- **Coral de foco** (#cc785c): el borde y el anillo de foco; en el tema oscuro es también el color primario (con texto #141413, 5,5:1).

### Neutral
- **Lienzo crema** (#faf9f5): fondo de página, de tarjetas y de menús flotantes.
- **Crema suave** (#f5f0e8): cabecera de tabla, barra lateral y zonas apagadas.
- **Crema de tarjeta** (#efe9de): botón secundario, insignia neutra.
- **Crema fuerte** (#e8e0d2): el ítem activo del menú y el foco de las listas.
- **Tinta cálida** (#141413): todo el texto principal.
- **Tinta apagada** (#6c6a64): texto secundario, 5,1:1 sobre el lienzo.
- **Filete** (#e6dfd8): el borde de 1 px de tarjetas y separadores.
- **Línea de campo** (#cfc7b8): el borde de campos y selectores, un escalón más marcado que el filete.

### Estado
- **Verde de éxito** (#167b39): confirmaciones y «API ok»; sirve de texto sobre crema.
- **Ocre de aviso** (#936100): avisos y «API degraded».
- **Verde azulado informativo** (#0f7a6a): información neutra.
- **Ladrillo de error** (#b33335): errores, acciones destructivas y «Sin conexión».

### Tema oscuro
El tema oscuro sale de las superficies de la definición de origen y de valores derivados; se activa solo con la preferencia del sistema operativo.

| Rol | Claro | Oscuro |
|---|---|---|
| Fondo | #faf9f5 | #181715 |
| Tarjeta | #faf9f5 | #1f1e1b |
| Menú flotante y secundarios | #faf9f5 / #efe9de | #252320 |
| Texto | #141413 | #faf9f5 |
| Texto secundario | #6c6a64 | #a09d96 |
| Primario (con su texto) | #a9583e (#ffffff) | #cc785c (#141413) |
| Éxito / aviso / info | #167b39 / #936100 / #0f7a6a | #5db872 / #d4a017 / #5db8a6 |
| Destructivo | #b33335 | #ff8781 |
| Borde / campo | #e6dfd8 / #cfc7b8 | #2f2d29 / #3a3834 |

### Los 8 tonos de insignia
Cada tono tiene fondo, texto y borde, y es el vocabulario con el que un administrador elegirá el color de cada estado y prioridad. Se usan con `<Badge tono="verde">`; el texto de cada uno da 4,5:1 o más sobre su fondo, en los dos temas.

| Tono | Fondo | Texto | Borde | Fondo (oscuro) | Texto (oscuro) | Borde (oscuro) |
|---|---|---|---|---|---|---|
| gris | #efece8 | #4e473a | #cfcac1 | #312d28 | #c5bcae | #524c44 |
| rojo | #ffe5e1 | #742e29 | #efbcb6 | #442320 | #f8a59b | #6e3d38 |
| naranja | #ffe7da | #713408 | #ecc0a8 | #422616 | #f2ab83 | #6c4128 |
| amarillo | #f4edd5 | #5b4500 | #d8ca9e | #372d0c | #d5bc70 | #5b4c1a |
| verde | #dff3e2 | #115629 | #b0d6b6 | #1a3520 | #8ed09c | #2f5838 |
| azul | #ddefff | #124a7b | #aecef1 | #192f46 | #8cc3fc | #2e5072 |
| violeta | #f2e8ff | #543772 | #d3c1eb | #342742 | #cdaef2 | #56436c |
| rosa | #ffe4ee | #6f2d4a | #ecbbcc | #41232f | #f2a3c1 | #6b3c4f |

### Named Rules
**The One Coral Rule.** El coral marca dónde se actúa (la acción principal, el enlace, el foco) y nada más. No se usa como decoración ni para decir que algo está bien o mal.

**The Words-With-Color Rule.** El estado nunca viaja solo en color: cada punto, insignia o tono lleva su texto al lado.

**The Token Rule.** `src/index.css` es el único archivo con valores de color. Un color nuevo es un token nuevo ahí; el chequeo de `pnpm lint` rechaza cualquier otro.

## Typography

**Display Font:** Cormorant Garamond Variable (con EB Garamond y serif del sistema)
**Body Font:** Inter Variable (con la sans del sistema)
**Label/Mono Font:** JetBrains Mono Variable, para números de ticket y códigos

**Character:** Una serif editorial y fina para el título de cada pantalla, sobre una sans humanista y neutra que hace todo el trabajo de lectura. Las tres fuentes son SIL OFL y se sirven desde el propio build, sin pedidos a otros orígenes.

### Hierarchy
- **Display** (500, 28 px, 1.2, -0.02em): el título de cada pantalla, el único `h1` (`PageHeader`). En el login llega a 40 px.
- **Title** (500, 16 px, 1.375): títulos de tarjetas y diálogos, en sans.
- **Body** (400, 14 px, 1.5): tablas, menús, formularios y descripciones. Los campos usan 16 px en pantallas chicas.
- **Label** (500, 14 px): etiquetas de campo y texto de botones.
- **Caption** (500, 13 px): insignias.
- **Section label** (500, 12 px, 0.025em, mayúsculas): los títulos de sección del menú lateral.
- **Code** (400, 14 px, JetBrains Mono): números de ticket (`TE-000013`).

### Named Rules
**The Serif-Is-For-Titles Rule.** La serif aparece solo en el título de pantalla y en la marca. Un título de tarjeta, de diálogo o de tabla va en Inter.

**The Weight-500 Rule.** La serif nunca va en negrita: el peso es 500 con -0,02em de tracking. Para enfatizar, se sube el tamaño, no el peso.

## Layout

Un marco fijo y una columna de contenido centrada.

- **Marco:** encabezado de 48 px arriba, barra lateral de 240 px a la izquierda y contenido con 24 px de relleno.
- **Contenido:** `Page` lo centra con un máximo de 1200 px y 24 px entre bloques.
- **Escritorio:** se diseña para 1280 px o más. A 1024 px nada se rompe ni scrollea de costado: una tabla ancha scrollea dentro de su propio contenedor.
- **Ritmo:** base de 4 px; los saltos habituales son 8, 12, 16 y 24 px.
- **Densidad:** controles de 36 px (40 px en el botón grande). La bandeja apunta a filas compactas para que entren las 20 de cada página; hoy conserva el relleno estándar de la tabla.

## Elevation & Depth

El sistema es plano por tonos. La profundidad sale de un escalón de crema a otro (lienzo, crema suave, crema de tarjeta) y de un filete de 1 px, no de sombras. Las únicas superficies que se despegan son los menús flotantes y los diálogos, que llevan el color de menú, un anillo de 1 px y, los menús, una sombra mínima; detrás de un diálogo va un velo (`scrim`).

### Named Rules
**The Flat-By-Default Rule.** Una superficie en reposo no lleva sombra. El borde de 1 px y el escalón de color separan; la sombra solo aparece en lo que flota.

## Shapes

Esquinas suaves y consistentes: 8 px en botones, campos y selectores; 12 px en tarjetas, tablas y diálogos; píldora completa en las insignias. El anillo de foco es de 3 px, en coral al 50 %. No hay recortes ni geometrías especiales.

## Components

Tranquilos y firmes: el borde, el color y el foco hacen todo el trabajo.

### Buttons
- **Shape:** esquina de 8 px; 36 px de alto (28, 32, 36 y 40 px en `xs`, `sm`, por defecto y `lg`).
- **Primary:** coral de arcilla con texto blanco; al presionar pasa a coral pulsado y baja 1 px.
- **Outline / Secondary / Ghost:** borde de filete o crema de tarjeta; ninguno cambia al pasar el mouse, solo al presionar.
- **Destructive:** tinte del ladrillo al 10 % con texto ladrillo; nunca un relleno sólido.
- **Disabled:** al 50 % de opacidad y sin eventos.

### Chips / Badges
- **Style:** píldora de 24 px, 13 px en 500. La variante por defecto es crema de tarjeta con tinta; con `tono` toma el fondo, el texto y el borde de uno de los 8 tonos.
- **State:** una insignia es solo información, no un botón.

### Cards / Containers
- **Corner Style:** 12 px.
- **Background:** lienzo (claro) o tarjeta (oscuro), con un anillo de 1 px al 10 % de la tinta.
- **Shadow Strategy:** ninguna.
- **Internal Padding:** 16 px (12 px en la variante chica).

### Inputs / Fields
- **Style:** 36 px de alto, esquina de 8 px, borde de línea de campo y fondo transparente.
- **Focus:** el borde pasa a coral de foco y aparece un anillo de 3 px al 50 %.
- **Error / Disabled:** el error tiñe el borde de ladrillo y suma un anillo al 20 %; deshabilitado baja al 50 %.

### Tables
- **Style:** cabecera de 40 px en 500, filas separadas por un filete de 1 px y sin fondo propio.
- **State:** la fila se tiñe al pasar el mouse (crema suave al 50 %): es de los pocos lugares donde el hover es parte del sistema.
- **Overflow:** una tabla ancha scrollea dentro de su contenedor, nunca la página.

### Navigation
- **Style:** barra lateral de 240 px en crema suave, agrupada por secciones («Módulos», «Administración») con su etiqueta en mayúsculas de 12 px. Cada módulo suma su sección sin rediseñar el menú.
- **Active:** fondo crema fuerte y texto en 500; los enlaces del menú se tiñen apenas al pasar el mouse.
- **Header:** 48 px, con la marca en serif, las migas de pan y, a la derecha, el usuario y sus acciones.

### Componentes compartidos
- **`Page`:** contenedor centrado de hasta 1200 px.
- **`PageHeader`:** el único `h1` de la pantalla, en la serif, con descripción y acciones opcionales.
- **`LoadingState`:** `role="status"` con un ícono de giro que se apaga con «reducir movimiento».
- **`EmptyState`:** título, descripción y acción opcionales, en un recuadro punteado.
- **`ErrorState`:** `role="alert"` con ícono y texto; con `onRetry` suma «Reintentar».
- **`HealthIndicator`:** punto de éxito, aviso o destructivo, siempre con su texto.

## Do's and Don'ts

### Do:
- **Do** tomar todo color de un token de `src/index.css` (`bg-primary`, `text-muted-foreground`, `bg-tono-rojo`).
- **Do** usar `Page` y `PageHeader` en cada pantalla y uno de los tres estados para cargar, vaciar y fallar.
- **Do** acompañar el color de estado con texto.
- **Do** usar el coral solo para la acción principal, el enlace y el foco.
- **Do** mirar la galería `/estilos` (solo en desarrollo) antes de crear un componente.

### Don't:
- **Don't** usar blanco puro ni grises fríos de Tailwind (`bg-white`, `bg-slate-100`, `bg-gray-50`): el lienzo es crema.
- **Don't** poner la serif en negrita ni en títulos de tarjeta, diálogo o tabla.
- **Don't** agregar sombras decorativas ni efectos de hover a botones.
- **Don't** sumar un acento nuevo ni una cuarta superficie: crema, tarjeta y oscuro bastan.
- **Don't** usar el coral claro (#cc785c) como fondo de texto blanco: no pasa AA.
