import { Link } from "@tanstack/react-router";

const linkClassName = "rounded-md px-3 py-1.5 text-sm hover:bg-muted";

export function Sidebar() {
  return (
    <nav aria-label="Navegación principal" className="flex w-52 flex-col gap-1 border-r p-3">
      <Link to="/" className={linkClassName} activeProps={{ className: "bg-muted font-medium" }}>
        Inicio
      </Link>
    </nav>
  );
}
