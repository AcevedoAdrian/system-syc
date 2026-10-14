// Migas del encabezado (SPEC 09): de dónde viene la pantalla y en qué módulo está. Una pantalla de un
// módulo nuevo suma su prefijo acá; una ruta que no está en la lista no muestra migas.
const SECTIONS: Array<{ prefix: string; trail: string[] }> = [
  { prefix: "/tickets/nuevo", trail: ["Módulos", "Tickets", "Nuevo ticket"] },
  { prefix: "/tickets/", trail: ["Módulos", "Tickets", "Detalle"] },
  { prefix: "/tickets", trail: ["Módulos", "Tickets"] },
  { prefix: "/admin/departamentos", trail: ["Administración", "Departamentos"] },
  { prefix: "/admin/catalogos", trail: ["Administración", "Catálogos"] },
  { prefix: "/admin/usuarios", trail: ["Administración", "Usuarios"] },
  { prefix: "/estilos", trail: ["Desarrollo", "Galería de estilos"] },
];

export function breadcrumbsFor(pathname: string): string[] {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return SECTIONS.find(({ prefix }) => path === prefix || path.startsWith(prefix))?.trail ?? [];
}
