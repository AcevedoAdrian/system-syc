import { formatTicketNumber } from "@syc/contracts";
import { Link, useBlocker, useNavigate } from "@tanstack/react-router";
import { useCallback, useId, useRef, useState } from "react";
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
  // Eliminar sale de la pantalla a propósito, aunque el formulario tenga cambios: no debe frenarse.
  const leaving = useRef(false);
  // El texto que explica por qué «Cambiar estado» y «Cambiar departamento» están deshabilitados.
  const dirtyHintId = useId();

  // Con cambios sin guardar, salir de la pantalla (otro link, atrás) o cerrar la pestaña pide confirmar.
  // Las funciones son estables: `useBlocker` vuelve a registrar el bloqueo cada vez que cambian.
  const shouldBlock = useCallback(() => dirty && !leaving.current, [dirty]);
  const blocker = useBlocker({
    shouldBlockFn: shouldBlock,
    enableBeforeUnload: shouldBlock,
    withResolver: true,
  });

  const reload = useCallback(() => refetch(), [refetch]);
  const onDirtyChange = useCallback((value: boolean) => {
    setDirty(value);
    if (value) setNotice(undefined);
  }, []);

  if (isPending) return <p role="status">Cargando ticket…</p>;
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
      leaving.current = true;
      await navigate({ to: "/tickets" });
    } catch (failure) {
      leaving.current = false;
      setRemoveError(getErrorMessage(failure));
    }
  };

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold wrap-break-word">
          {formatTicketNumber(ticket.numero)} · {ticket.titulo}
        </h1>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="secondary">{ticket.estado.nombre}</Badge>
          {ticket.departamento.nombre}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => setStatusOpen(true)}
            disabled={dirty}
            aria-describedby={dirty ? dirtyHintId : undefined}
          >
            Cambiar estado
          </Button>
          {isAdmin && (
            <>
              <Button
                variant="outline"
                onClick={() => setDepartmentOpen(true)}
                disabled={dirty}
                aria-describedby={dirty ? dirtyHintId : undefined}
              >
                Cambiar departamento
              </Button>
              {/* Se distingue como destructivo con texto y borde rojos sobre el botón `outline`. La variante
                  `destructive` rellena el fondo con el rojo al 10%: da 4,0:1 en claro (AA pide 4,5:1) y
                  3,3:1 al pasar el mouse. Acá: 4,8:1, y el hover refuerza el borde en vez del fondo. */}
              <Button
                variant="outline"
                className="border-destructive/50 text-destructive hover:border-destructive hover:bg-background hover:text-destructive"
                onClick={() => setRemoveOpen(true)}
              >
                Eliminar
              </Button>
            </>
          )}
        </div>
        {dirty && (
          <p id={dirtyHintId} className="text-sm text-muted-foreground">
            Guardá o descartá los cambios para cambiar el estado o el departamento.
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
      <div className="flex flex-col gap-2">
        <TicketForm
          key={ticket.updatedAt}
          ticket={ticket}
          onSaved={() => setNotice("Cambios guardados.")}
          onReload={reload}
          onDirtyChange={onDirtyChange}
        />
        {/* Pegado al botón «Guardar cambios», que está al final del formulario. Siempre montado y fuera
            del `key`: una región viva que aparece ya con su texto, o que se recrea con el formulario, no
            siempre se anuncia. */}
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      </div>

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
      <ConfirmDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title="Descartar cambios"
        description="Hay cambios sin guardar en el ticket. Si salís, se pierden."
        confirmLabel="Salir sin guardar"
        onConfirm={() => blocker.proceed?.()}
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
