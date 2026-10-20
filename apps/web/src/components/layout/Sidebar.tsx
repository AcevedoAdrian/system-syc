import type { CatalogRuta } from "@syc/contracts";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Book, Building2, ChevronRight, Ticket, Users } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Logo } from "@/components/common/Logo";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { CATALOG_KINDS } from "@/features/catalogs/catalog-kinds";
import { HealthIndicator } from "@/features/health/components/HealthIndicator";
import { catalogoFromSearch } from "./navigation";

const CATALOGOS = Object.keys(CATALOG_KINDS) as CatalogRuta[];

const itemClass =
  "flex min-h-10 w-full items-center gap-2.5 rounded-lg px-3.5 py-2 text-sm leading-snug font-medium transition-colors";
const activeClass = "bg-card text-foreground";
const idleClass = "text-muted-foreground hover:bg-muted hover:text-foreground";
const sectionClass =
  "px-3.5 pb-2 text-xs font-medium tracking-[1.5px] text-muted-foreground uppercase";

function SectionTitle({ children, spaced }: { children: ReactNode; spaced?: boolean }) {
  return <p className={`${sectionClass}${spaced ? " pt-5" : ""}`}>{children}</p>;
}

export function Sidebar() {
  const { data: user } = useCurrentUser();
  const { pathname, search } = useRouterState({ select: (state) => state.location });

  const inTickets = pathname === "/tickets" || pathname.startsWith("/tickets/");
  const inDepartamentos = pathname.startsWith("/admin/departamentos");
  const inUsuarios = pathname.startsWith("/admin/usuarios");
  const inCatalogos = pathname.startsWith("/admin/catalogos");
  const catalogo = catalogoFromSearch(search);
  const navigate = useNavigate();
  // El submenú se abre solo dentro de los catálogos; ahí el usuario puede plegarlo. Al salir se
  // restablece, para que al volver aparezca abierto.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    if (!inCatalogos) setCollapsed(false);
  }, [inCatalogos]);
  const catalogosOpen = inCatalogos && !collapsed;

  return (
    <aside className="flex max-w-62 flex-[1_1_248px] flex-col gap-8 border-r bg-background px-4 pt-5 pb-6 max-[807px]:max-w-none max-[807px]:border-r-0 max-[807px]:border-b">
      {/* Va a `/` (que redirige a los tickets) y no a `/tickets`: el router marca como página actual
          todo enlace activo, y «Tickets» ya es el que la representa. */}
      <Link to="/" className="flex h-10 items-center px-2">
        <Logo height={40} />
      </Link>

      <nav aria-label="Navegación principal" className="flex flex-col gap-1">
        <SectionTitle>Módulos</SectionTitle>
        <Link
          to="/tickets"
          aria-current={inTickets ? "page" : undefined}
          className={`${itemClass} ${inTickets ? activeClass : idleClass}`}
        >
          <Ticket className="size-4.5 shrink-0" aria-hidden="true" />
          Tickets
        </Link>

        {user?.role === "admin" && (
          <>
            <SectionTitle spaced>Administración</SectionTitle>
            <Link
              to="/admin/departamentos"
              aria-current={inDepartamentos ? "page" : undefined}
              className={`${itemClass} ${inDepartamentos ? activeClass : idleClass}`}
            >
              <Building2 className="size-4.5 shrink-0" aria-hidden="true" />
              Departamentos
            </Link>
            <Link
              to="/admin/usuarios"
              aria-current={inUsuarios ? "page" : undefined}
              className={`${itemClass} ${inUsuarios ? activeClass : idleClass}`}
            >
              <Users className="size-4.5 shrink-0" aria-hidden="true" />
              Usuarios
            </Link>
            {/* Un botón y no un enlace: no hay una vista general de catálogos a la que ir, y el router
                marcaría como página actual a este enlace y al catálogo abierto a la vez. */}
            <button
              type="button"
              aria-expanded={catalogosOpen}
              aria-controls="submenu-catalogos"
              className={`${itemClass} ${inCatalogos ? "text-foreground" : idleClass}`}
              onClick={() => {
                if (inCatalogos) setCollapsed((value) => !value);
                else void navigate({ to: "/admin/catalogos", search: { catalogo } });
              }}
            >
              <Book className="size-4.5 shrink-0" aria-hidden="true" />
              Catálogos
              <ChevronRight
                className={`ml-auto size-4 shrink-0 transition-transform ${catalogosOpen ? "rotate-90" : ""}`}
                aria-hidden="true"
              />
            </button>
            {catalogosOpen && (
              <div id="submenu-catalogos" className="mt-0.5 mb-1 flex flex-col gap-0.5">
                {CATALOGOS.map((ruta) => {
                  const current = ruta === catalogo;
                  return (
                    <Link
                      key={ruta}
                      to="/admin/catalogos"
                      search={{ catalogo: ruta }}
                      aria-current={current ? "page" : undefined}
                      className={`${itemClass} py-1.5 pr-3.5 pl-10.5 ${current ? activeClass : idleClass}`}
                    >
                      {CATALOG_KINDS[ruta].title}
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </nav>

      <div className="mt-auto flex flex-col gap-4">
        <div className="flex flex-col gap-2 rounded-xl border border-note-border bg-note p-5 text-note-foreground">
          <span className="text-xs font-medium tracking-[1.5px] text-note-muted uppercase">
            Próximamente
          </span>
          <span className="text-base leading-snug font-medium">
            Nuevos módulos operativos y administrativos
          </span>
          <span className="text-sm text-note-muted">
            Se sumarán aquí a medida que estén listos.
          </span>
        </div>
        <HealthIndicator />
      </div>
    </aside>
  );
}
