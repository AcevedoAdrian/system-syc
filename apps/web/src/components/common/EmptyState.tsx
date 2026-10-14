import type { ReactNode } from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  // Acción para salir del estado vacío (por ejemplo «Limpiar filtros» o «Nuevo ticket»).
  action?: ReactNode;
}

// Estado vacío de una lista o de un bloque (SPEC 09): dice qué falta y, si hay, cómo seguir.
export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-prose text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
