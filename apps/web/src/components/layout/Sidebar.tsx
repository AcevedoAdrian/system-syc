import { Link } from "@tanstack/react-router";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";

const linkClassName = "rounded-md px-3 py-1.5 text-sm hover:bg-muted";
const activeProps = { className: "bg-muted font-medium" };

export function Sidebar() {
  const { data: user } = useCurrentUser();

  return (
    <nav aria-label="Navegación principal" className="flex w-52 flex-col gap-1 border-r p-3">
      <Link to="/" className={linkClassName} activeProps={activeProps}>
        Inicio
      </Link>
      {user?.role === "admin" && (
        <>
          <p className="mt-3 px-3 text-xs font-medium uppercase text-muted-foreground">
            Administración
          </p>
          <Link to="/admin/departamentos" className={linkClassName} activeProps={activeProps}>
            Departamentos
          </Link>
          <Link to="/admin/usuarios" className={linkClassName} activeProps={activeProps}>
            Usuarios
          </Link>
        </>
      )}
    </nav>
  );
}
