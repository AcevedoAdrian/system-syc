# Documento de Arquitectura y Definición de Producto (PRD)

**Proyecto:** Sistema de Gestión Interna y Control de Tickets
**Autor / Desarrollador Principal:** Adrián Hugo Acevedo
**Fecha de Definición:** Septiembre 2026
**Estado:** Definición de MVP (Producto Mínimo Viable)

---

## 1. Resumen Ejecutivo
El proyecto consiste en el desarrollo de una aplicación web centralizada para la gestión interna de un área tecnológica y administrativa. El sistema permitirá registrar, dar seguimiento y auditar los requerimientos (tickets) recibidos, sirviendo como puente entre las solicitudes formales internas (Actuaciones Simples) y los tickets de servicio generados por empresas proveedoras externas. La aplicación sienta las bases estructurales para escalar a futuro hacia la gestión de inventario, notas internas y administración de tareas.

## 2. Definición del Problema
Actualmente, el registro de requerimientos y tickets se gestiona de manera manual a través de una base de datos en Notion. Esta metodología presenta las siguientes limitaciones operativas y técnicas:
* **Falta de trazabilidad estructurada:** Es difícil auditar el ciclo de vida de un ticket, saber con precisión quién modificó un estado o cuándo se realizó una actualización.
* **Escalabilidad limitada:** A medida que se incorporan nuevos módulos (redes, presupuesto, desarrollo), la interfaz de Notion dificulta la estructuración relacional compleja y la integridad de los datos.
* **Desacople de sistemas:** No existe un vínculo relacional fuerte entre el origen de la solicitud (Actuación Simple física/digital) y el seguimiento de la empresa externa.
* **Gestión de roles y permisos:** Notion no ofrece un control de acceso granular (RBAC) adecuado para separar las vistas y acciones entre un administrador y un agente de distintos departamentos (Administrativo, Técnico, Redes, Desarrollo).

## 3. Solución Propuesta
Desarrollar un sistema de gestión a medida ("in-house") operado exclusivamente por el equipo interno del área. La plataforma ofrecerá una ingesta de datos altamente tipada y estructurada mediante una base de datos relacional (PostgreSQL), interfaces de usuario optimizadas para la carga rápida de registros y un historial de auditoría automatizado. 

El sistema eliminará la dependencia de herramientas de terceros para el control del trabajo diario, centralizando la gestión de usuarios, catálogos de dependencias (Áreas y Edificios) y el ciclo de vida del ticket en un entorno seguro y auditable.

## 4. Alcance del Proyecto

### 4.1. Incluido en el MVP (Producto Mínimo Viable)
* **Gestión de Usuarios y Accesos:** Creación, edición, desactivación (soft delete) y reseteo de contraseñas por parte del Administrador.
* **Catálogos Maestros:** Gestión de Áreas solicitantes, Edificios y Departamentos internos.
* **Gestión de Tickets:** Creación y edición colaborativa de tickets. Capacidad de asociar números de Actuación Simple (opcional) y Tickets de Empresa X (opcional).
* **Bandeja General:** Visualización de tickets agrupados por Departamento (Administrativo, Técnico, Redes, Desarrollo), donde cualquier agente autorizado puede actualizar el estado.
* **Auditoría Básica:** Registro automático en todas las tablas de `creado_por`, `actualizado_por`, `created_at` y `updated_at`.
* **Historial de Ticket:** Bitácora inmutable que registra cada cambio de estado o modificación de la descripción de un ticket, indicando el usuario y la fecha.
* **Eliminación Lógica (Soft Deletes):** Ningún registro (usuario, ticket, área) se elimina físicamente de la base de datos para preservar la integridad relacional.

### 4.2. Fuera del Alcance (Fase 2)
* Creación de campos de base de datos de forma dinámica desde la interfaz gráfica.
* Subida y almacenamiento de archivos adjuntos (PDFs, imágenes).
* Notificaciones automáticas por correo electrónico (el MVP utilizará validación visual manual).
* Acceso al sistema por parte de usuarios externos al área.
* Scripts de migración masiva de datos históricos desde Notion.
* Asignación forzada de tickets a agentes individuales (los tickets permanecerán en bandejas departamentales).

---

## 5. Arquitectura Tecnológica

El desarrollo se centralizará en un **Monorepo** para garantizar la coherencia del tipado de datos entre el cliente y el servidor, maximizando la velocidad de desarrollo de un único programador.

| Capa | Tecnología | Justificación |
| :--- | :--- | :--- |
| **Gestión de Repositorio** | Turborepo + pnpm workspaces | Optimización de tiempos de compilación, caché local y gestión eficiente de dependencias. |
| **Base de Datos** | PostgreSQL 16+ | Estructura relacional robusta, soporte para alta concurrencia e integridad referencial. |
| **ORM** | Prisma | Tipado estricto end-to-end, migraciones declarativas y experiencia de desarrollo ágil. |
| **Backend (API)** | NestJS (TypeScript) | Arquitectura modular, inyección de dependencias y creación rápida de endpoints REST. |
| **Autenticación** | Better Auth | Gestión de sesiones con cookies HttpOnly y uso de su plugin *Organization* para grupos y roles. |
| **Frontend (Cliente)** | React 19 + Vite (TypeScript) | Renderizado rápido del lado del cliente (SPA) con empaquetado optimizado. |
| **Estado y UI (Frontend)** | TanStack (Query, Router, Table) + Zustand + shadcn/ui + Tailwind CSS | Sincronización eficiente del estado del servidor, ruteo tipado, tablas complejas y componentes UI accesibles. |
| **Testing** | Vitest | Pruebas unitarias ultrarrápidas con compatibilidad nativa para ESM y TypeScript. |
| **Infraestructura y Despliegue**| Docker + Docker Compose | Contenedorización de todos los servicios (Nginx para React, NestJS, Postgres) en un servidor Linux on-premise. |

---

## 6. Modelo de Datos y Entidades Principales

El esquema de base de datos se estructurará en tres pilares fundamentales:

1. **Pilar de Seguridad y Acceso (Better Auth):**
   * Tablas gestionadas automáticamente por Better Auth: `User`, `Session`, `Organization` (para Departamentos/Grupos), `Member`.
   * Los permisos granulares (ej. `CREAR_TICKET`) existirán como constantes estáticas en el código de NestJS (Guards), validados contra el rol del usuario en la base de datos.
2. **Pilar de Catálogos (Maestros):**
   * `Area`: Dependencias que solicitan el trabajo (ej. Comisiones).
   * `Edificio`: Direcciones físicas asociadas a las áreas.
   * `Departamento`: Divisiones internas de trabajo (Administrativo, Técnico, Redes, Desarrollo).
3. **Pilar Operativo (Core):**
   * `Ticket`: Entidad central. Relaciones directas con `Departamento`, `Area` y `Edificio`.
     * *Atributos clave:* `actuacion_simple`, `ticket_empresa_x`, `estado` (enum), `prioridad`, `tipo`, `modulo`, `notificado` (boolean), `solucion_descripcion`.
   * `TicketHistory`: Tabla de log/auditoría.
     * *Atributos clave:* `ticket_id`, `usuario_id`, `accion` (ej. "Cambió estado a Pendiente"), `fecha`.

*Nota de Arquitectura:* Todas las tablas del sistema implementarán los campos de auditoría base (`created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`).

---

## 7. Flujo de Trabajo Operativo

1. **Inicialización (Setup):** El sistema se despliega con una cuenta de Administrador raíz. El administrador carga los catálogos maestros (Departamentos, Áreas, Edificios) y crea las credenciales de los agentes internos, asignándoles su rol correspondiente.
2. **Recepción:** Un requerimiento ingresa al área mediante Actuación Simple (nota física), correo electrónico o llamada telefónica.
3. **Ingesta de Datos:** Un agente se autentica en la aplicación y crea un nuevo Ticket. Selecciona el Área y Edificio solicitante, categoriza el módulo y el tipo de problema, y transcribe la Actuación Simple. El ticket es derivado a la bandeja del Departamento correspondiente (ej. Redes).
4. **Gestión y Ejecución:** Si la tarea requiere intervención de terceros, el agente interactúa con la "Empresa X" y actualiza el ticket en el sistema agregando el número de seguimiento externo (`ticket_empresa_x`). El agente avanza los estados lógicos (Pendiente -> En Progreso -> Finalizado) a medida que avanza el trabajo.
5. **Resolución y Cierre:** Se documenta la solución técnica en el campo `solucion_descripcion`, se marca la validación visual de "Notificado al usuario" y el ticket se da por cerrado.
6. **Auditoría Transparente:** Durante todo el ciclo de vida, el sistema intercepta las peticiones (usando el token de la cookie HttpOnly) y documenta automáticamente cada mutación en la tabla `TicketHistory`, permitiendo a los administradores reconstruir la línea de tiempo de cualquier requerimiento.