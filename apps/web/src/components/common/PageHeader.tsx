import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  // La acción principal de la pantalla (por ejemplo, «Nuevo departamento»), a la derecha.
  action?: ReactNode;
}

// Encabezado de las pantallas de administración (SPEC 09, etapa 9.6): título en Cormorant, bajada y la
// acción principal a la derecha.
export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="font-heading text-4xl leading-[1.15] font-medium tracking-[-0.02em]">
          {title}
        </h1>
        {description && <p className="mt-1 text-base text-muted-foreground">{description}</p>}
      </div>
      {action}
    </header>
  );
}
