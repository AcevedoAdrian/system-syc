import { formatTicketNumber } from "@syc/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { getErrorMessage, isNotFound } from "@/lib/errors";
import { useTicket } from "../hooks/useTicket";
import { useRemoveTicket } from "../hooks/useTicketMutations";
import { ChangeDepartmentDialog } from "./ChangeDepartmentDialog";
import { ChangeStatusDialog } from "./ChangeStatusDialog";
import { TicketComments } from "./TicketComments";
import { TicketForm } from "./TicketForm";
import { TicketHistory } from "./TicketHistory";

// Pantalla del ticket: encabezado con sus acciones, formulario de datos, comentarios e historial. Las acciones del
// admin (cambiar departamento y eliminar) se ocultan a un agente; la API las rechaza igual.
export function TicketDetail({ ticketId }: { ticketId: string }) {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const { data: ticket, isPending, isError, error, refetch } = useTicket(ticketId);
  const remove = useRemoveTicket();
  const [dirty, setDirty] = useState(false);
  const [notice, setNotice] = useState<string>();
  const [statusOpen, setStatusOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removeError, setRemoveError] = useState<string>();

  const reload = useCallback(() => refetch(), [refetch]);
  const onDirtyChange = useCallback((value: boolean) => {
    setDirty(value);
    if (value) setNotice(undefined);
  }, []);

  if (isPending) return <p>Cargando ticket…</p>;
  if (isError) {
    // Ajeno, inexistente o eliminado dan el mismo 404: la pantalla no depende del mensaje.
    return (
      <div className="flex flex-col gap-2">
        <p role="alert">
          {isNotFound(error)
            ? "El ticket no existe."
            : "No se pudo cargar el ticket. Intentá de nuevo."}
        </p>
        <Link to="/tickets" className="text-sm underline">
          Volver a los tickets
        </Link>
      </div>
    );
  }

  const isAdmin = user?.role === "admin";
  const confirmRemove = async () => {
    setRemoveError(undefined);
    try {
      await remove.mutateAsync({ ticketId: ticket.id });
      await navigate({ to: "/tickets" });
    } catch (failure) {
      setRemoveError(getErrorMessage(failure));
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">
          {formatTicketNumber(ticket.numero)} · {ticket.titulo}
        </h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{ticket.estado.nombre}</Badge>
          {ticket.departamento.nombre}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setStatusOpen(true)} disabled={dirty}>
            Cambiar estado
          </Button>
          {isAdmin && (
            <>
              <Button variant="outline" onClick={() => setDepartmentOpen(true)} disabled={dirty}>
                Cambiar departamento
              </Button>
              <Button variant="outline" onClick={() => setRemoveOpen(true)}>
                Eliminar
              </Button>
            </>
          )}
        </div>
        {dirty && (
          <p className="text-sm text-muted-foreground">
            Guardá o descartá los cambios para cambiar el estado o el departamento.
          </p>
        )}
        {notice && (
          <p role="status" className="text-sm text-green-600">
            {notice}
          </p>
        )}
        {removeError && (
          <p role="alert" className="text-sm text-destructive">
            {removeError}
          </p>
        )}
      </header>

      {/* Se vuelve a montar con cada versión nueva del ticket (`updatedAt`): así el formulario
          parte siempre de lo que guardó el servidor, y «Recargar» lo reinicia. */}
      <TicketForm
        key={ticket.updatedAt}
        ticket={ticket}
        onSaved={() => setNotice("Cambios guardados.")}
        onReload={reload}
        onDirtyChange={onDirtyChange}
      />

      {/* Fuera del `key` del formulario: comentar no cambia el ticket y no lo reinicia. */}
      <TicketComments ticketId={ticket.id} />

      <TicketHistory ticketId={ticket.id} />

      <ChangeStatusDialog
        key={`estado-${ticket.updatedAt}`}
        ticket={ticket}
        open={statusOpen}
        onOpenChange={setStatusOpen}
        onReload={reload}
      />
      {isAdmin && (
        <>
          <ChangeDepartmentDialog
            key={`departamento-${ticket.updatedAt}`}
            ticket={ticket}
            open={departmentOpen}
            onOpenChange={setDepartmentOpen}
            onReload={reload}
          />
          <ConfirmDialog
            open={removeOpen}
            onOpenChange={setRemoveOpen}
            title="Eliminar ticket"
            description={`Se eliminará el ticket ${formatTicketNumber(ticket.numero)}. Su número no se reutiliza y su historial se conserva, pero deja de aparecer en la lista.`}
            confirmLabel="Eliminar"
            onConfirm={confirmRemove}
          />
        </>
      )}
    </section>
  );
}
