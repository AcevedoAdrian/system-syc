import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  // Botones de la pantalla (por ejemplo «Nuevo ticket»), a la derecha del título.
  actions?: ReactNode;
}

// Encabezado de una pantalla y su único `<h1>` (SPEC 09). El título va en la serif editorial de la
// base visual (`font-display`, peso 500, -0.02em); la descripción y las acciones son opcionales.
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="font-display text-[28px] leading-[1.2] font-medium tracking-[-0.02em] wrap-break-word">
          {title}
        </h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}
