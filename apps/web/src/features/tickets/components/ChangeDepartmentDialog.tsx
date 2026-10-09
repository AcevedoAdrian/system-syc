import type { Ticket } from "@syc/contracts";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrganizations } from "@/features/organizations/hooks/useOrganizations";
import { DepartmentSelect } from "@/features/users/components/DepartmentSelect";
import { getErrorMessage, isStaleTicket } from "@/lib/errors";
import { useReloadTicket } from "../hooks/useReloadTicket";
import { useChangeTicketDepartment } from "../hooks/useTicketMutations";
import { Field } from "./Field";

interface ChangeDepartmentDialogProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Vuelve a leer el ticket (botón «Recargar» del 409).
  onReload: () => Promise<unknown>;
}

function DepartmentForm({
  ticket,
  onDone,
  onReload,
}: Omit<ChangeDepartmentDialogProps, "open" | "onOpenChange"> & { onDone: () => void }) {
  const change = useChangeTicketDepartment();
  const { data: departments = [] } = useOrganizations();
  const [departamentoId, setDepartamentoId] = useState("");
  const [serverError, setServerError] = useState<string>();
  const [stale, setStale] = useState(false);
  const { reloading, reload } = useReloadTicket(onReload, onDone, setServerError);
  const [pending, setPending] = useState(false);
  const [missing, setMissing] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setServerError(undefined);
    setStale(false);
    if (!departamentoId) {
      setMissing(true);
      return;
    }
    setMissing(false);
    setPending(true);
    try {
      await change.mutateAsync({
        ticketId: ticket.id,
        updatedAt: ticket.updatedAt,
        departamentoId,
      });
      onDone();
    } catch (error) {
      setStale(isStaleTicket(error));
      setServerError(getErrorMessage(error));
    } finally {
      setPending(false);
    }
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <Field
        id="departamentoId"
        label="Nuevo departamento"
        required
        error={missing ? "Elegí un departamento." : undefined}
      >
        {(aria) => (
          <DepartmentSelect
            id="departamentoId"
            value={departamentoId}
            onChange={setDepartamentoId}
            // El actual no se ofrece; los desactivados tampoco (DepartmentSelect filtra por `activo`).
            departments={departments.filter(
              (department) => department.id !== ticket.departamento.id,
            )}
            invalid={missing}
            aria-describedby={aria["aria-describedby"]}
            aria-required={aria["aria-required"]}
          />
        )}
      </Field>
      {serverError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <p>{serverError}</p>
          {stale && (
            <Button type="button" variant="outline" size="sm" onClick={reload} disabled={reloading}>
              {reloading ? "Recargando…" : "Recargar"}
            </Button>
          )}
        </div>
      )}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Cambiando…" : "Cambiar departamento"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Solo lo ve el admin (la API igual lo rechaza a un agente con 403). El número, el historial y los
// comentarios se conservan; desde el cambio, editan los agentes del departamento nuevo.
export function ChangeDepartmentDialog({
  open,
  onOpenChange,
  ...formProps
}: ChangeDepartmentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar departamento</DialogTitle>
          <DialogDescription>
            Departamento actual: {formProps.ticket.departamento.nombre}. Los agentes de ese
            departamento dejan de ver el ticket.
          </DialogDescription>
        </DialogHeader>
        <DepartmentForm {...formProps} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
