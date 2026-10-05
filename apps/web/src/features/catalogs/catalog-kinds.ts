import type { CatalogRuta } from "@syc/contracts";

// Textos de cada catálogo en la pantalla de administración: una pestaña por catálogo.
export interface CatalogKind {
  tab: string;
  title: string;
  newLabel: string; // botón y título del diálogo de alta
  editLabel: string; // título del diálogo de edición
  loadingLabel: string;
  loadErrorLabel: string;
}

export const CATALOG_KINDS: Record<CatalogRuta, CatalogKind> = {
  areas: {
    tab: "Áreas",
    title: "Áreas",
    newLabel: "Nueva área",
    editLabel: "Editar área",
    loadingLabel: "Cargando áreas…",
    loadErrorLabel: "No se pudieron cargar las áreas.",
  },
  edificios: {
    tab: "Edificios",
    title: "Edificios",
    newLabel: "Nuevo edificio",
    editLabel: "Editar edificio",
    loadingLabel: "Cargando edificios…",
    loadErrorLabel: "No se pudieron cargar los edificios.",
  },
  tipos: {
    tab: "Tipos",
    title: "Tipos de ticket",
    newLabel: "Nuevo tipo",
    editLabel: "Editar tipo",
    loadingLabel: "Cargando tipos…",
    loadErrorLabel: "No se pudieron cargar los tipos.",
  },
  prioridades: {
    tab: "Prioridades",
    title: "Prioridades",
    newLabel: "Nueva prioridad",
    editLabel: "Editar prioridad",
    loadingLabel: "Cargando prioridades…",
    loadErrorLabel: "No se pudieron cargar las prioridades.",
  },
  modulos: {
    tab: "Módulos",
    title: "Módulos",
    newLabel: "Nuevo módulo",
    editLabel: "Editar módulo",
    loadingLabel: "Cargando módulos…",
    loadErrorLabel: "No se pudieron cargar los módulos.",
  },
  proveedores: {
    tab: "Proveedores",
    title: "Proveedores",
    newLabel: "Nuevo proveedor",
    editLabel: "Editar proveedor",
    loadingLabel: "Cargando proveedores…",
    loadErrorLabel: "No se pudieron cargar los proveedores.",
  },
  estados: {
    tab: "Estados",
    title: "Estados",
    newLabel: "Nuevo estado",
    editLabel: "Editar estado",
    loadingLabel: "Cargando estados…",
    loadErrorLabel: "No se pudieron cargar los estados.",
  },
};
