import { useTicketHistory } from "../hooks/useTicketHistory";
import { describeChanges, formatTimestamp } from "../ticket-fields";

type Snapshot = Record<string, unknown>;

const asSnapshot = (value: unknown): Snapshot | undefined =>
  value && typeof value === "object" ? (value as Snapshot) : undefined;

// Historial del ticket: lo que se lee de `AuditLog`, del cambio más reciente al más antiguo. Cada
// `update` muestra una línea por campo que cambió ("Estado: Pendiente → En progreso"); el nombre de
// las referencias sale de la propia foto, así que no cambia si el ítem se renombra después.
export function TicketHistory({ ticketId }: { ticketId: string }) {
  const { data: entries, isPending, isError } = useTicketHistory(ticketId);

  return (
    <section aria-labelledby="historial-titulo" className="flex max-w-2xl flex-col gap-3">
      <h2 id="historial-titulo" className="text-lg font-semibold">
        Historial
      </h2>
      {isPending && <p className="text-sm text-muted-foreground">Cargando historial…</p>}
      {isError && (
        <p role="alert" className="text-sm text-destructive">
          No se pudo cargar el historial.
        </p>
      )}
      {entries && entries.length === 0 && (
        <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>
      )}
      {entries && entries.length > 0 && (
        <ol className="flex flex-col gap-3">
          {entries.map((entry) => {
            const changes =
              entry.action === "update"
                ? describeChanges(asSnapshot(entry.payload.before), asSnapshot(entry.payload.after))
                : [];
            return (
              <li key={entry.id} className="flex flex-col gap-1 border-l-2 pl-3 text-sm">
                <p className="text-muted-foreground">
                  {formatTimestamp(entry.createdAt)} · {entry.actor?.name ?? "Sistema"}
                </p>
                {entry.action === "create" && <p>Ticket creado</p>}
                {entry.action === "delete" && <p>Ticket eliminado</p>}
                {/* Solo se anota que hubo un comentario: el texto nunca está en el historial. */}
                {entry.action === "comment_create" && <p>Comentario agregado</p>}
                {entry.action === "comment_delete" && <p>Comentario eliminado</p>}
                {changes.map((change) => (
                  <p key={change.field}>
                    <span className="font-medium">{change.label}:</span> {change.before} →{" "}
                    {change.after}
                  </p>
                ))}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
