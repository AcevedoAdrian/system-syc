import { cn } from "cn";
import type { ReactNode } from "react";

interface PageProps {
  children: ReactNode;
  className?: string;
}

// Contenedor estándar de una pantalla (SPEC 09): ancho máximo, centrado y espaciado vertical. El relleno
// lo da el marco (`AppShell`), para no sumarlo dos veces.
export function Page({ children, className }: PageProps) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1200px] flex-col gap-6", className)}>
      {children}
    </div>
  );
}
