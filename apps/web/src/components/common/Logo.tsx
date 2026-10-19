import { cn } from "cn";
import type { CSSProperties } from "react";

interface LogoProps {
  /** Alto de las piezas en px; el resto de las medidas del logo salen de este valor. */
  height?: number;
  className?: string;
}

// Logotipo «system·syc»: una pieza de tinta y otra de acento, encastradas, con muescas de ticket.
// Los estilos de las piezas están en `index.css` (`.logo-*`), que es donde viven los colores.
export function Logo({ height = 40, className }: LogoProps) {
  return (
    <div
      role="img"
      aria-label="system-syc"
      className={cn("logo", className)}
      style={{ "--h": `${height}px` } as CSSProperties}
    >
      <span className="logo-system" aria-hidden="true">
        system
      </span>
      <span className="logo-syc" aria-hidden="true">
        syc
      </span>
    </div>
  );
}
