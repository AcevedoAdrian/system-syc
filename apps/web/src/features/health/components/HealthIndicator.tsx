import { useHealth } from "../hooks/useHealth";

// Estado de `health.check` al pie del menú, visible en todas las pantallas (SPEC 01 pide que la web lo
// muestre; ya no hay una pantalla de inicio que lo aloje). Éxito: todo bien; aviso: la API responde
// pero la base no; destructivo: no hay conexión con la API. El color nunca va solo: lleva el texto.
export function HealthIndicator() {
  const { data, isPending, isError } = useHealth();

  let color = "bg-muted-foreground";
  let label = "Consultando estado…";
  if (!isPending && (isError || !data)) {
    color = "bg-destructive";
    label = "Sin conexión con la API";
  } else if (data) {
    color = data.status === "ok" ? "bg-success" : "bg-warning";
    label = `API ${data.status} · base de datos ${data.database}`;
  }

  return (
    <p
      role="status"
      data-testid="health-indicator"
      className="flex items-center gap-2 px-3 text-xs text-muted-foreground"
    >
      <span aria-hidden className={`size-2 shrink-0 rounded-full ${color}`} />
      {label}
    </p>
  );
}
