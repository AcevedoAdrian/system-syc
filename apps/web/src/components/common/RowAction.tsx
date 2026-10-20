import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RowActionProps {
  // Describe la acción y el registro («Editar «Redes»»): es el nombre del botón y su tooltip.
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  // Una acción destructiva (eliminar) se tiñe de rojo al pasar el mouse.
  destructive?: boolean;
}

// Un botón de ícono de 40px de una fila de listado (editar, eliminar, subir…).
export function RowAction({ label, icon: Icon, onClick, disabled, destructive }: RowActionProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      className={
        destructive
          ? "size-10 text-muted-foreground hover:text-destructive"
          : "size-10 text-muted-foreground"
      }
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Icon aria-hidden="true" className="size-4.5" />
    </Button>
  );
}
