import { Clock } from "lucide-react";
import { FormSection } from "@/components/common/FormSection";
import { useTicketHistory } from "../hooks/useTicketHistory";
import { describeChanges, formatTimestamp } from "../ticket-fields";

type Snapshot = Record<string, unknown>;

const asSnapshot = (value: unknown): Snapshot | undefined =>
  value && typeof value === "object" ? (value as Snapshot) : undefined;

const emptyClass = "rounded-lg border border-dashed px-6 py-6 text-center text-muted-foreground";

// Historial del ticket: lo que se lee de `AuditLog`, del cambio más reciente al más antiguo. Cada
// `update` muestra una línea por campo que cambió ("Estado: Pendiente → En progreso"); el nombre de
// las referencias sale de la propia foto, así que no cambia si el ítem se renombra después.
export function TicketHistory({ ticketId }: { ticketId: string }) {
  const { data: entries, isPending, isError } = useTicketHistory(ticketId);

  return (
    <FormSection
      id="historial-titulo"
      tone="amber"
      icon={Clock}
      title="Historial"
      description="Todo lo que pasó con el ticket, del más reciente al más antiguo."
    >
      {isPending && <p className="text-muted-foreground">Cargando historial…</p>}
      {isError && (
        <p role="alert" className="text-destructive">
          No se pudo cargar el historial.
        </p>
      )}
      {entries && entries.length === 0 && <p className={emptyClass}>Todavía no hay movimientos.</p>}
      {entries && entries.length > 0 && (
        <ol className="flex flex-col gap-5">
          {entries.map((entry) => {
            const changes =
              entry.action === "update"
                ? describeChanges(asSnapshot(entry.payload.before), asSnapshot(entry.payload.after))
                : [];
            return (
              <li
                key={entry.id}
                className="flex flex-col gap-0.5 border-l-[3px] border-(--sc) pl-4"
              >
                <p className="text-[13px] text-muted-foreground">
                  <time dateTime={entry.createdAt}>{formatTimestamp(entry.createdAt)}</time> ·{" "}
                  {entry.actor?.name ?? "Sistema"}
                </p>
                {entry.action === "create" && <p className="text-foreground">Ticket creado</p>}
                {entry.action === "delete" && <p className="text-foreground">Ticket eliminado</p>}
                {/* Solo se anota que hubo un comentario: el texto nunca está en el historial. */}
                {entry.action === "comment_create" && (
                  <p className="text-foreground">Comentario agregado</p>
                )}
                {entry.action === "comment_delete" && (
                  <p className="text-foreground">Comentario eliminado</p>
                )}
                {changes.map((change) => (
                  <p key={change.field} className="wrap-break-word text-foreground">
                    <span className="font-medium">{change.label}:</span> {change.before} →{" "}
                    {change.after}
                  </p>
                ))}
              </li>
            );
          })}
        </ol>
      )}
    </FormSection>
  );
}
