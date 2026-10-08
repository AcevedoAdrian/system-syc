import { zodResolver } from "@hookform/resolvers/zod";
import {
  hoyArgentina,
  type Ticket,
  type UpdateTicketInput,
  updateTicketInputSchema,
} from "@syc/contracts";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, isStaleTicket } from "@/lib/errors";
import { useUpdateTicket } from "../hooks/useTicketMutations";
import { CatalogOptionSelect } from "./CatalogOptionSelect";
import { Field } from "./Field";

// El formulario trabaja con texto (un campo en blanco es ""); el esquema lo convierte en `null`.
type TicketFormInput = z.input<typeof updateTicketInputSchema>;

// Los valores actuales del ticket. `updatedAt` es la versión que el servidor compara (bloqueo
// optimista): el formulario se monta con la que leyó y no la cambia hasta que se lo vuelve a montar
// con un ticket nuevo (después de guardar, o de «Recargar»).
function valuesOf(ticket: Ticket): TicketFormInput {
  return {
    ticketId: ticket.id,
    updatedAt: ticket.updatedAt,
    titulo: ticket.titulo,
    descripcion: ticket.descripcion ?? "",
    actuacionSimple: ticket.actuacionSimple ?? "",
    prioridadId: ticket.prioridad.id,
    areaId: ticket.area?.id ?? "",
    edificioId: ticket.edificio?.id ?? "",
    tipoId: ticket.tipo?.id ?? "",
    moduloId: ticket.modulo?.id ?? "",
    proveedorId: ticket.proveedor?.id ?? "",
    referenciaExterna: ticket.referenciaExterna ?? "",
    fechaRecepcion: ticket.fechaRecepcion,
    fechaCierre: ticket.fechaCierre,
    fechaReabierto: ticket.fechaReabierto,
    solucionDescripcion: ticket.solucionDescripcion ?? "",
    notificado: ticket.notificado,
  };
}

const DATE_ERROR = "Ingresá una fecha válida, de hoy o anterior.";
const REFERENCIA_ERROR =
  "Usá el formato número/año, por ejemplo 19092/2026 (el año va de 2000 a 2100).";
const REFERENCIA_SIN_PROVEEDOR = "Elegí un proveedor para cargar la referencia.";

interface TicketFormProps {
  ticket: Ticket;
  // Se guardaron los cambios (el ticket se vuelve a leer y el formulario se vuelve a montar).
  onSaved: () => void;
  // Vuelve a leer el ticket (botón «Recargar» del 409).
  onReload: () => Promise<unknown>;
  // Hay cambios sin guardar: la pantalla no deja cambiar estado ni departamento mientras tanto.
  onDirtyChange: (dirty: boolean) => void;
}

// Edita los campos del ticket (reemplaza todos, como `tickets.update`). El estado y el departamento
// no están acá: tienen sus propios diálogos. `fechaCierre` y `fechaReabierto` solo aparecen si ya
// tienen valor: se cargan al cambiar de estado y acá solo se corrigen.
export function TicketForm({ ticket, onSaved, onReload, onDirtyChange }: TicketFormProps) {
  const update = useUpdateTicket();
  const [serverError, setServerError] = useState<string>();
  const [stale, setStale] = useState(false);
  const [reloading, setReloading] = useState(false);
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<TicketFormInput, unknown, UpdateTicketInput>({
    resolver: zodResolver(updateTicketInputSchema),
    defaultValues: valuesOf(ticket),
  });
  const hasProveedor = Boolean(watch("proveedorId"));

  useEffect(() => onDirtyChange(isDirty), [isDirty, onDirtyChange]);

  const submit = handleSubmit(async (values) => {
    setServerError(undefined);
    setStale(false);
    try {
      await update.mutateAsync(values);
      onSaved();
    } catch (error) {
      setStale(isStaleTicket(error));
      setServerError(getErrorMessage(error));
    }
  });

  const discard = () => {
    reset(valuesOf(ticket));
    setServerError(undefined);
    setStale(false);
  };

  const reload = async () => {
    setReloading(true);
    try {
      await onReload();
    } finally {
      setReloading(false);
    }
  };

  const catalogs = [
    { id: "areaId", label: "Área", ruta: "areas", current: ticket.area },
    { id: "edificioId", label: "Edificio", ruta: "edificios", current: ticket.edificio },
    { id: "tipoId", label: "Tipo", ruta: "tipos", current: ticket.tipo },
    { id: "moduloId", label: "Módulo", ruta: "modulos", current: ticket.modulo },
  ] as const;

  return (
    <form className="flex max-w-2xl flex-col gap-4" onSubmit={submit} noValidate>
      <Field
        id="titulo"
        label="Título"
        required
        error={errors.titulo && "El título es obligatorio (hasta 200 caracteres)."}
      >
        {(control) => <Input id="titulo" autoComplete="off" {...control} {...register("titulo")} />}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="prioridadId"
          label="Prioridad"
          required
          error={errors.prioridadId && "Elegí una prioridad."}
        >
          {(aria) => (
            <Controller
              control={control}
              name="prioridadId"
              render={({ field }) => (
                <CatalogOptionSelect
                  id="prioridadId"
                  ruta="prioridades"
                  value={field.value}
                  onChange={field.onChange}
                  current={ticket.prioridad}
                  {...aria}
                />
              )}
            />
          )}
        </Field>
        <Field
          id="fechaRecepcion"
          label="Fecha de recepción"
          required
          error={errors.fechaRecepcion && DATE_ERROR}
        >
          {(aria) => (
            <Input
              id="fechaRecepcion"
              type="date"
              max={hoyArgentina()}
              {...aria}
              {...register("fechaRecepcion")}
            />
          )}
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {catalogs.map((catalog) => (
          <Field key={catalog.id} id={catalog.id} label={catalog.label}>
            {(aria) => (
              <Controller
                control={control}
                name={catalog.id}
                render={({ field }) => (
                  <CatalogOptionSelect
                    id={catalog.id}
                    ruta={catalog.ruta}
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    placeholder="Sin asignar"
                    emptyLabel="Sin asignar"
                    current={catalog.current}
                    {...aria}
                  />
                )}
              />
            )}
          </Field>
        ))}
      </div>

      <Field
        id="descripcion"
        label="Descripción"
        error={errors.descripcion && "Hasta 5000 caracteres."}
      >
        {(aria) => <Textarea id="descripcion" rows={4} {...aria} {...register("descripcion")} />}
      </Field>

      <Field
        id="actuacionSimple"
        label="Actuación simple"
        error={errors.actuacionSimple && "Hasta 500 caracteres."}
      >
        {(aria) => (
          <Input
            id="actuacionSimple"
            autoComplete="off"
            {...aria}
            {...register("actuacionSimple")}
          />
        )}
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="proveedorId" label="Proveedor">
          {(aria) => (
            <Controller
              control={control}
              name="proveedorId"
              render={({ field }) => (
                <CatalogOptionSelect
                  id="proveedorId"
                  ruta="proveedores"
                  value={field.value ?? ""}
                  onChange={(value) => {
                    field.onChange(value);
                    // La referencia es del proveedor: al cambiar de proveedor (o quitarlo) no se
                    // conserva; se carga la del nuevo o queda vacía (Q30).
                    setValue("referenciaExterna", "", { shouldDirty: true });
                  }}
                  placeholder="Sin proveedor"
                  emptyLabel="Sin proveedor"
                  current={ticket.proveedor}
                  {...aria}
                />
              )}
            />
          )}
        </Field>
        <Field
          id="referenciaExterna"
          label="Referencia externa"
          hint={hasProveedor ? undefined : REFERENCIA_SIN_PROVEEDOR}
          error={errors.referenciaExterna && REFERENCIA_ERROR}
        >
          {(aria) => (
            <Input
              id="referenciaExterna"
              placeholder="19092/2026"
              autoComplete="off"
              disabled={!hasProveedor}
              {...aria}
              {...register("referenciaExterna")}
            />
          )}
        </Field>
      </div>

      <Field
        id="solucionDescripcion"
        label="Solución"
        error={errors.solucionDescripcion && "Hasta 5000 caracteres."}
      >
        {(aria) => (
          <Textarea
            id="solucionDescripcion"
            rows={3}
            {...aria}
            {...register("solucionDescripcion")}
          />
        )}
      </Field>

      {(ticket.fechaCierre || ticket.fechaReabierto) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {ticket.fechaCierre && (
            <Field
              id="fechaCierre"
              label="Fecha de cierre"
              required
              error={errors.fechaCierre && DATE_ERROR}
            >
              {(aria) => (
                <Input
                  id="fechaCierre"
                  type="date"
                  max={hoyArgentina()}
                  {...aria}
                  {...register("fechaCierre")}
                />
              )}
            </Field>
          )}
          {ticket.fechaReabierto && (
            <Field
              id="fechaReabierto"
              label="Fecha de reapertura"
              required
              error={errors.fechaReabierto && DATE_ERROR}
            >
              {(aria) => (
                <Input
                  id="fechaReabierto"
                  type="date"
                  max={hoyArgentina()}
                  {...aria}
                  {...register("fechaReabierto")}
                />
              )}
            </Field>
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        <Controller
          control={control}
          name="notificado"
          render={({ field }) => (
            <Checkbox
              id="notificado"
              checked={field.value}
              onCheckedChange={(checked) => field.onChange(checked === true)}
            />
          )}
        />
        <Label htmlFor="notificado">Se notificó al usuario</Label>
      </div>

      {serverError && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
          <p>{serverError}</p>
          {stale && (
            <Button type="button" variant="outline" size="sm" onClick={reload} disabled={reloading}>
              Recargar
            </Button>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? "Guardando…" : "Guardar cambios"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={discard}
          disabled={!isDirty || isSubmitting}
        >
          Descartar cambios
        </Button>
      </div>
    </form>
  );
}
