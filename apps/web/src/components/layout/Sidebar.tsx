import { Link, type LinkProps } from "@tanstack/react-router";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { HealthIndicator } from "@/features/health/components/HealthIndicator";

interface MenuSection {
  title: string;
  adminOnly?: boolean;
  items: Array<{ to: LinkProps["to"]; label: string }>;
}

// El menú se arma por secciones (SPEC 09): un módulo nuevo suma su sección o su link acá, y el resto
// del menú no se rediseña. La barrera real de «Administración» está en la API.
const MENU: MenuSection[] = [
  { title: "Módulos", items: [{ to: "/tickets", label: "Tickets" }] },
  {
    title: "Administración",
    adminOnly: true,
    items: [
      { to: "/admin/departamentos", label: "Departamentos" },
      { to: "/admin/catalogos", label: "Catálogos" },
      { to: "/admin/usuarios", label: "Usuarios" },
    ],
  },
];

const linkClassName =
  "flex min-h-9 items-center rounded-md px-3 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60";
const activeProps = { className: "bg-sidebar-accent font-medium text-sidebar-accent-foreground" };

export function Sidebar() {
  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === "admin";

  return (
    <nav
      aria-label="Navegación principal"
      className="flex w-60 shrink-0 flex-col gap-5 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground"
    >
      {MENU.filter((section) => !section.adminOnly || isAdmin).map((section) => (
        <div key={section.title} className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {section.title}
          </p>
          {section.items.map((item) => (
            <Link key={item.to} to={item.to} className={linkClassName} activeProps={activeProps}>
              {item.label}
            </Link>
          ))}
        </div>
      ))}
      <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
        Los nuevos módulos aparecerán aquí.
      </p>
      <div className="mt-auto">
        <HealthIndicator />
      </div>
    </nav>
  );
}
