import type { CatalogRuta } from "@syc/contracts";

// Textos de cada catálogo en la pantalla de administración (el menú lateral abre cada uno).
export interface CatalogKind {
  description: string; // la bajada del encabezado
  title: string;
  newLabel: string; // botón y título del diálogo de alta
  editLabel: string; // título del diálogo de edición
  loadingLabel: string;
  loadErrorLabel: string;
}

export const CATALOG_KINDS: Record<CatalogRuta, CatalogKind> = {
  areas: {
    description: "Áreas que generan o reciben tickets.",
    title: "Áreas",
    newLabel: "Nueva área",
    editLabel: "Editar área",
    loadingLabel: "Cargando áreas…",
    loadErrorLabel: "No se pudieron cargar las áreas.",
  },
  tiposArea: {
    description: "Clasificación que se asigna a cada área.",
    title: "Tipos de área",
    newLabel: "Nuevo tipo de área",
    editLabel: "Editar tipo de área",
    loadingLabel: "Cargando tipos de área…",
    loadErrorLabel: "No se pudieron cargar los tipos de área.",
  },
  edificios: {
    description: "Edificios y sedes de la organización.",
    title: "Edificios",
    newLabel: "Nuevo edificio",
    editLabel: "Editar edificio",
    loadingLabel: "Cargando edificios…",
    loadErrorLabel: "No se pudieron cargar los edificios.",
  },
  tipos: {
    description: "Tipos de ticket disponibles.",
    title: "Tipos de ticket",
    newLabel: "Nuevo tipo",
    editLabel: "Editar tipo",
    loadingLabel: "Cargando tipos…",
    loadErrorLabel: "No se pudieron cargar los tipos.",
  },
  prioridades: {
    description:
      "Niveles de prioridad, de la menos a la más urgente. Siempre debe quedar al menos una activa.",
    title: "Prioridades",
    newLabel: "Nueva prioridad",
    editLabel: "Editar prioridad",
    loadingLabel: "Cargando prioridades…",
    loadErrorLabel: "No se pudieron cargar las prioridades.",
  },
  modulos: {
    description:
      "Partes del sistema donde puede estar el problema. Cada módulo pertenece a uno o más departamentos.",
    title: "Módulos",
    newLabel: "Nuevo módulo",
    editLabel: "Editar módulo",
    loadingLabel: "Cargando módulos…",
    loadErrorLabel: "No se pudieron cargar los módulos.",
  },
  proveedores: {
    description: "Proveedores asociados al servicio.",
    title: "Proveedores",
    newLabel: "Nuevo proveedor",
    editLabel: "Editar proveedor",
    loadingLabel: "Cargando proveedores…",
    loadErrorLabel: "No se pudieron cargar los proveedores.",
  },
  estados: {
    description: "Estados del ticket. Se pueden renombrar, reordenar y desactivar.",
    title: "Estados",
    newLabel: "Nuevo estado",
    editLabel: "Editar estado",
    loadingLabel: "Cargando estados…",
    loadErrorLabel: "No se pudieron cargar los estados.",
  },
};
