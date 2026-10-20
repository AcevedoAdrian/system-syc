import { type CatalogRuta, catalogRutaSchema } from "@syc/contracts";
import { CATALOG_KINDS } from "@/features/catalogs/catalog-kinds";

export interface Breadcrumb {
  parent: string;
  current: string;
}

// El catálogo abierto vive en `?catalogo=`; un valor desconocido o ausente cae en el primero, igual
// que la pantalla de catálogos.
export function catalogoFromSearch(search: unknown): CatalogRuta {
  const value =
    typeof search === "object" && search !== null && "catalogo" in search
      ? search.catalogo
      : undefined;
  const parsed = catalogRutaSchema.safeParse(value);
  return parsed.success ? parsed.data : "areas";
}

// Migas de pan de la barra superior. `null` en una ruta que no las tiene (no se dibuja nada).
export function breadcrumbFor(pathname: string, catalogo: CatalogRuta): Breadcrumb | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;

  if (path === "/tickets") return { parent: "Módulos", current: "Tickets" };
  if (path === "/tickets/nuevo") return { parent: "Tickets", current: "Nuevo ticket" };
  if (path.startsWith("/tickets/")) return { parent: "Tickets", current: "Detalle del ticket" };
  if (path === "/admin/departamentos") {
    return { parent: "Administración", current: "Departamentos" };
  }
  if (path === "/admin/usuarios") return { parent: "Administración", current: "Usuarios" };
  if (path === "/admin/catalogos") {
    return { parent: "Catálogos", current: CATALOG_KINDS[catalogo].title };
  }
  return null;
}

// Iniciales del avatar: la primera letra de las dos primeras palabras del nombre.
export function initialsOf(name: string | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}
