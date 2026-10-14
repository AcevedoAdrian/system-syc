import { LoaderCircleIcon } from "lucide-react";

interface LoadingStateProps {
  label: string;
}

// Estado de carga de una pantalla o de un bloque (SPEC 09). `role="status"` lo anuncia a los lectores
// de pantalla; el giro se apaga con «reducir movimiento».
export function LoadingState({ label }: LoadingStateProps) {
  return (
    <div role="status" className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
      <LoaderCircleIcon aria-hidden="true" className="size-4 motion-safe:animate-spin" />
      <span>{label}</span>
    </div>
  );
}
