import {
  CLAVES_DE_CIERRE,
  changeTicketStatusInputSchema,
  hoyArgentina,
  type Ticket,
} from "@syc/contracts";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCatalogOptions } from "@/features/catalogs/hooks/useCatalogOptions";
import { getErrorMessage, isStaleTicket } from "@/lib/errors";
import { useReloadTicket } from "../hooks/useReloadTicket";
import { useChangeTicketStatus } from "../hooks/useTicketMutations";
import { CatalogOptionSelect } from "./CatalogOptionSelect";
import { Field } from "./Field";

interface StatusFormValues {
  estadoId: string;
  fechaCierre: string;
  fechaReabierto: string;
  solucionDescripcion: string;
}

const DATE_ERROR = "Ingresá una fecha válida, de hoy o anterior.";

interface ChangeStatusDialogProps {
  ticket: Ticket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Vuelve a leer el ticket (botón «Recargar» del 409).
  onReload: () => Promise<unknown>;
}

function StatusForm({
  ticket,
  onDone,
  onReload,
}: Omit<ChangeStatusDialogProps, "open" | "onOpenChange"> & { onDone: () => void }) {
  const change = useChangeTicketStatus();
  const { data: estados = [] } = useCatalogOptions("estados");
  const [serverError, setServerError] = useState<string>();
  const [stale, setStale] = useState(false);
  const { reloading, reload } = useReloadTicket(onReload, onDone, setServerError);
  const {
    control,
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<StatusFormValues>({
    defaultValues: {
      estadoId: "",
      // Se propone la fecha de cierre actual (al pasar de un cierre a otro se conserva), o hoy.
      fechaCierre: ticket.fechaCierre ?? hoyArgentina(),
      fechaReabierto: hoyArgentina(),
      solucionDescripcion: ticket.solucionDescripcion ?? "",
    },
  });

  // Lo que se pide depende de la `clave` del estado elegido, nunca de su nombre.
  const clave = estados.find((estado) => estado.id === watch("estadoId"))?.clave ?? null;
  const cierra = clave !== null && CLAVES_DE_CIERRE.includes(clave);
  const reabre = clave === "REABIERTO";

  const submit = handleSubmit(async (values) => {
    setServerError(undefined);
    setStale(false);
    if (!values.estadoId) {
      setError("estadoId", { message: "Elegí un estado." });
      return;
    }
    const parsed = changeTicketStatusInputSchema.safeParse({
      ticketId: ticket.id,
      updatedAt: ticket.updatedAt,
      estadoId: values.estadoId,
      ...(cierra && {
        fechaCierre: values.fechaCierre,
        solucionDescripcion: values.solucionDescripcion,
      }),
      ...(reabre && { fechaReabierto: values.fechaReabierto }),
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "fechaCierre" || field === "fechaReabierto") {
          setError(field, { message: DATE_ERROR });
        } else if (field === "solucionDescripcion") {
          setError("solucionDescripcion", { message: "Hasta 5000 caracteres." });
        }
      }
      return;
    }
    try {
      await change.mutateAsync(parsed.data);
      onDone();
    } catch (error) {
      setStale(isStaleTicket(error));
      setServerError(getErrorMessage(error));
    }
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <Field id="estadoId" label="Nuevo estado" required error={errors.estadoId?.message}>
        {(aria) => (
          <Controller
            control={control}
            name="estadoId"
            render={({ field }) => (
              <CatalogOptionSelect
                id="estadoId"
                ruta="estados"
                value={field.value}
                onChange={field.onChange}
                placeholder="Elegí un estado"
                excludeId={ticket.estado.id}
                {...aria}
              />
            )}
          />
        )}
      </Field>

      {cierra && (
        <>
          <Field
            id="estado-fechaCierre"
            label="Fecha de cierre"
            required
            error={errors.fechaCierre?.message}
          >
            {(aria) => (
              <Input
                id="estado-fechaCierre"
                type="date"
                max={hoyArgentina()}
                {...aria}
                {...register("fechaCierre")}
              />
            )}
          </Field>
          <Field
            id="estado-solucion"
            label="Solución (opcional)"
            error={errors.solucionDescripcion?.message}
          >
            {(aria) => (
              <Textarea
                id="estado-solucion"
                rows={3}
                {...aria}
                {...register("solucionDescripcion")}
              />
            )}
          </Field>
        </>
      )}

      {reabre && (
        <Field
          id="estado-fechaReabierto"
          label="Fecha de reapertura"
          required
          error={errors.fechaReabierto?.message}
        >
          {(aria) => (
            <Input
              id="estado-fechaReabierto"
              type="date"
              max={hoyArgentina()}
              {...aria}
              {...register("fechaReabierto")}
            />
          )}
        </Field>
      )}

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
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Cambiando…" : "Cambiar estado"}
        </Button>
      </DialogFooter>
    </form>
  );
}

// Cambia el estado del ticket sin tocar el resto de sus datos. Ofrece los estados activos menos el
// actual; si el elegido es de cierre pide la fecha de cierre (y deja cargar la solución), y si es
// `REABIERTO` pide la fecha de reapertura.
export function ChangeStatusDialog({ open, onOpenChange, ...formProps }: ChangeStatusDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar estado</DialogTitle>
          <DialogDescription>
            Estado actual: {formProps.ticket.estado.nombre}. Cualquier estado activo es válido.
          </DialogDescription>
        </DialogHeader>
        <StatusForm {...formProps} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
