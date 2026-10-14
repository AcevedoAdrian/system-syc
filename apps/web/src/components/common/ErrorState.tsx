import { CircleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title: string;
  description?: string;
  // Con `onRetry` aparece el botón «Reintentar», que lo llama.
  onRetry?: () => void;
}

// Error al cargar una pantalla o un bloque (SPEC 09). `role="alert"` lo anuncia enseguida; el color
// nunca va solo: lleva el ícono y el texto.
export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 py-6">
      <CircleAlertIcon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium text-destructive">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {onRetry && (
          <Button variant="outline" size="sm" className="mt-2 self-start" onClick={onRetry}>
            Reintentar
          </Button>
        )}
      </div>
    </div>
  );
}
