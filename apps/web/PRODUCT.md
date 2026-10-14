# Product

<!-- impeccable:product-schema 1 -->

> Registro de producto para el trabajo de diseño sobre la web. Ante una diferencia con `docs/prd.md`, manda el PRD.

## Platform

web

## Users

- **Agentes** del área tecnológica y administrativa. Cargan y actualizan tickets a lo largo de la jornada, en escritorio o notebook, repitiendo la misma tarea muchas veces. Cada agente pertenece a un solo departamento y solo ve y opera sobre los tickets del suyo.
- **Administrador (jefe).** Supervisa todos los departamentos y administra usuarios, departamentos y catálogos desde la propia interfaz.

El sistema lo usa solo el equipo interno; no hay registro público ni usuarios externos.

## Product Purpose

Sistema in-house de gestión interna y seguimiento de tickets. Reemplaza el registro manual de requerimientos en una base de Notion, que no daba trazabilidad, integridad de datos ni control de acceso por departamento.

Éxito: que el equipo cargue un requerimiento rápido, que cada cambio de estado quede registrado con quién y cuándo, y que cada departamento vea solo lo suyo.

Es una **cáscara extensible**: hoy el único módulo de negocio es Tickets, y a futuro (inventario, notas internas, tareas) llegan como módulos nuevos sin tocar los existentes. Autenticación, departamentos, permisos y auditoría son transversales.

## Positioning

Lo que una herramienta de tickets genérica no ofrece tal cual:

- **Trazabilidad automática:** cada cambio se audita con usuario y fecha, y el historial de un ticket muestra qué pasó sin exponer el texto de comentarios eliminados.
- **Permisos por departamento:** un agente que pide un ticket ajeno recibe el mismo «no existe» que por un número inexistente.
- **Vínculo entre la Actuación Simple interna y el ticket del proveedor externo** (referencia `Número/año`, única por proveedor).
- **Carga rápida:** crear un ticket pide pocos datos (título, prioridad y fecha de recepción); el resto se completa después.

## Operating Context

- Corre en un servidor Linux on-premise con Docker Compose, accedido por HTTP por IP, sin dominio ni HTTPS.
- Una sola URL: la API va por el mismo origen bajo `/api`.
- No debe depender de CDNs ni de servicios externos en tiempo de ejecución.
- Se usa en escritorio y notebook (1280 px o más). A 1024 px no debe romperse, pero no se optimiza.
- Los textos de la interfaz están en español.

## Capabilities and Constraints

- Tickets con número correlativo (`TE-000013`), edición con bloqueo optimista, cambio de estado y de departamento en diálogos aparte, eliminación lógica e historial.
- Comentarios inmutables; solo el admin los elimina.
- Bandeja con búsqueda sin distinguir mayúsculas ni acentos, filtros (estado, tipo de área, área, edificio, tipo, prioridad, proveedor, módulo, rango de fecha de recepción y texto) y 20 tickets por página.
- Catálogos administrables: Áreas, Tipos de área, Edificios, Proveedores, Tipos, Prioridades, Módulos y Estados. El área se elige en un selector agrupado por tipo y se muestra como «Diputado · Acosta».
- Los estados son un catálogo editable. Cuatro llevan clave interna fija (`FINALIZADO`, `CERRADO`, `CANCELADO`, `REABIERTO`) y las reglas se resuelven contra la clave, nunca contra el nombre.
- Solo dos roles: `agente` y `admin`.
- Fuera de alcance por ahora: adjuntos, exportar a CSV, campos personalizados desde la interfaz, acceso de usuarios externos y asignación a agentes individuales. Descartado: notificaciones por correo y migración desde Notion.

## Brand Commitments

- El nombre visible es «system-syc».
- No hay logo ni identidad institucional: no se inventan.
- No hay colores, tipografía ni tono de voz obligatorios. La dirección visual es una decisión abierta.

## Evidence on Hand

- `docs/prd.md` (producto) y `docs/architecture.md` (tecnología).
- Catálogos y datos de ejemplo en `seed-data/` (agentes y áreas reales de la institución; no son públicos).
- Ausencias que el trabajo futuro no debe fabricar: logo, testimonios, métricas de uso, cantidad de usuarios y capturas de la herramienta anterior.

## Product Principles

1. **La tarea manda.** Es una herramienta de trabajo diaria, repetitiva: la velocidad de carga y la lectura de la bandeja pesan más que la expresión.
2. **Cada cambio deja huella.** La interfaz hace visible quién hizo qué y cuándo, y nunca oculta ni reescribe el historial.
3. **El límite del departamento es invisible pero firme.** Nadie debe ver, ni siquiera por su ausencia, lo que está fuera de su alcance.
4. **Una base común, no un tema por módulo.** Lo que se construye para Tickets lo reutilizan los módulos que lleguen.
5. **Autocontenido.** Todo lo necesario viaja con el propio build; nada depende de la red externa.

## Accessibility & Inclusion

- Contraste AA (4,5:1 o más) en texto, en tema claro y en oscuro, como decisión del SPEC 09.
- El estado nunca se comunica solo con color: siempre hay texto.
- No se estableció una necesidad de accesibilidad específica de las personas usuarias más allá de eso.
