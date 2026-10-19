import { zodResolver } from "@hookform/resolvers/zod";
import {
  hoyArgentina,
  type Ticket,
  type UpdateTicketInput,
  updateTicketInputSchema,
} from "@syc/contracts";
import {
  Bell,
  Box,
  Building2,
  CalendarDays,
  CircleCheckBig,
  CircleDot,
  FileText,
  Flag,
  Hash,
  Layers,
  Lock,
  Tag,
  TextAlignStart,
  Ticket as TicketIcon,
  Truck,
  Type,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { FormActionBar } from "@/components/common/FormActionBar";
import { FormSection } from "@/components/common/FormSection";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage, isStaleTicket } from "@/lib/errors";
import { useUpdateTicket } from "../hooks/useTicketMutations";
import { CatalogOptionSelect } from "./CatalogOptionSelect";
import { controlClass, Field, TodayButton, textareaClass } from "./Field";
import { EstadoDot, PrioridadDot } from "./TicketBadges";

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

const monoClass = `${controlClass} font-mono text-[15px] md:text-[15px]`;

interface TicketFormProps {
  ticket: Ticket;
  // Se guardaron los cambios (el ticket se vuelve a leer y el formulario se vuelve a montar).
  onSaved: () => void;
  // Vuelve a leer el ticket (botón «Recargar» del 409).
  onReload: () => Promise<unknown>;
  // Hay cambios sin guardar: la pantalla no deja cambiar estado ni departamento mientras tanto.
  onDirtyChange: (dirty: boolean) => void;
  // El aviso de lo último que pasó («Cambios guardados.»), que se ve en la barra de acciones.
  notice?: string;
}

// Edita los campos del ticket (reemplaza todos, como `tickets.update`). El estado y el departamento
// no se editan acá: tienen sus propios diálogos, y el formulario solo los muestra. `fechaCierre` y
// `fechaReabierto` solo aparecen si ya tienen valor: se cargan al cambiar de estado y acá solo se
// corrigen.
export function TicketForm({ ticket, onSaved, onReload, onDirtyChange, notice }: TicketFormProps) {
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
    { id: "areaId", label: "Área", icon: Users, ruta: "areas", current: ticket.area },
    {
      id: "edificioId",
      label: "Edificio",
      icon: Building2,
      ruta: "edificios",
      current: ticket.edificio,
    },
    { id: "tipoId", label: "Tipo de ticket", icon: Layers, ruta: "tipos", current: ticket.tipo },
    { id: "moduloId", label: "Módulo", icon: Box, ruta: "modulos", current: ticket.modulo },
  ] as const;

  const message = serverError ? (
    <div role="alert" className="flex flex-wrap items-center gap-3 text-destructive">
      <p>{serverError}</p>
      {stale && (
        <Button type="button" variant="outline" onClick={reload} disabled={reloading}>
          Recargar
        </Button>
      )}
    </div>
  ) : (
    notice && <p className="text-success">{notice}</p>
  );

  return (
    <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
      <FormSection
        id="seccion-datos"
        tone="brand"
        icon={TicketIcon}
        title="Datos del ticket"
        description="Qué se pidió, quién lo gestiona y en qué punto está."
      >
        <div className="grid gap-5 min-[600px]:grid-cols-[180px_minmax(0,1fr)]">
          <Field
            id="actuacionSimple"
            label="Actuación simple"
            icon={FileText}
            hint="Suele ser corta."
            error={errors.actuacionSimple && "Hasta 500 caracteres."}
          >
            {(aria) => (
              <Input
                id="actuacionSimple"
                autoComplete="off"
                placeholder="Ej.: 1023/2026"
                className={monoClass}
                {...aria}
                {...register("actuacionSimple")}
              />
            )}
          </Field>
          {/* Solo se muestra: el departamento se cambia con «Cambiar departamento». */}
          <Field id="departamento" label="Departamento" icon={Building2}>
            {() => (
              <div className="relative">
                <Lock
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="departamento"
                  value={ticket.departamento.nombre}
                  readOnly
                  className={`${controlClass} bg-muted pl-10.5`}
                />
              </div>
            )}
          </Field>
        </div>

        <Field
          id="titulo"
          label="Título"
          icon={Type}
          required
          counter={{ value: (watch("titulo") ?? "").length, max: 200 }}
          error={errors.titulo && "El título es obligatorio (hasta 200 caracteres)."}
        >
          {(aria) => (
            <Input
              id="titulo"
              autoComplete="off"
              maxLength={200}
              placeholder="Resumí el requerimiento en una línea"
              className={controlClass}
              {...aria}
              {...register("titulo")}
            />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field
            id="prioridadId"
            label="Prioridad"
            icon={Flag}
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
                    leading={<PrioridadDot id={field.value} />}
                    {...aria}
                  />
                )}
              />
            )}
          </Field>
          {/* Solo se muestra: el estado se cambia con «Cambiar estado», que valida las fechas. */}
          <Field id="estado" label="Estado" icon={CircleDot} hint="Se cambia con «Cambiar estado».">
            {(aria) => (
              <div className="relative">
                <span className="pointer-events-none absolute top-1/2 left-3.5 flex -translate-y-1/2">
                  <EstadoDot estado={ticket.estado} />
                </span>
                <Input
                  id="estado"
                  value={ticket.estado.nombre}
                  readOnly
                  className={`${controlClass} bg-muted pl-9`}
                  {...aria}
                />
              </div>
            )}
          </Field>
          <Field
            id="fechaRecepcion"
            label="Fecha de recepción"
            icon={CalendarDays}
            required
            action={
              <TodayButton
                onClick={() =>
                  setValue("fechaRecepcion", hoyArgentina(), {
                    shouldDirty: true,
                    shouldValidate: true,
                  })
                }
              />
            }
            error={errors.fechaRecepcion && DATE_ERROR}
          >
            {(aria) => (
              <Input
                id="fechaRecepcion"
                type="date"
                max={hoyArgentina()}
                className={controlClass}
                {...aria}
                {...register("fechaRecepcion")}
              />
            )}
          </Field>
        </div>

        {(ticket.fechaCierre || ticket.fechaReabierto) && (
          <div className="form-callout">
            <p className="text-body">
              Las fechas de cierre y de reapertura se cargan al cambiar el estado; acá solo se
              corrigen.
            </p>
            <div className="grid gap-5 sm:grid-cols-2">
              {ticket.fechaCierre && (
                <Field
                  id="fechaCierre"
                  label="Fecha de cierre"
                  icon={CalendarDays}
                  required
                  error={errors.fechaCierre && DATE_ERROR}
                >
                  {(aria) => (
                    <Input
                      id="fechaCierre"
                      type="date"
                      max={hoyArgentina()}
                      className={controlClass}
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
                  icon={CalendarDays}
                  required
                  error={errors.fechaReabierto && DATE_ERROR}
                >
                  {(aria) => (
                    <Input
                      id="fechaReabierto"
                      type="date"
                      max={hoyArgentina()}
                      className={controlClass}
                      {...aria}
                      {...register("fechaReabierto")}
                    />
                  )}
                </Field>
              )}
            </div>
          </div>
        )}

        <Field
          id="descripcion"
          label="Descripción"
          icon={TextAlignStart}
          counter={{ value: (watch("descripcion") ?? "").length, max: 5000 }}
          error={errors.descripcion && "Hasta 5000 caracteres."}
        >
          {(aria) => (
            <Textarea
              id="descripcion"
              placeholder="Detalles, contexto y pasos para reproducir (opcional)"
              className={textareaClass}
              {...aria}
              {...register("descripcion")}
            />
          )}
        </Field>
      </FormSection>

      <div className="flex flex-wrap items-stretch gap-6">
        <FormSection
          id="seccion-clasificacion"
          tone="amber"
          icon={Tag}
          title="Clasificación"
          description="Opcional. Sale de los catálogos activos."
          className="min-w-0 flex-[3_1_420px]"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            {catalogs.map((catalog) => (
              <Field
                key={catalog.id}
                id={catalog.id}
                label={catalog.label}
                icon={catalog.icon}
                hint={catalog.id === "areaId" ? "Agrupada por tipo." : undefined}
              >
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
        </FormSection>

        <FormSection
          id="seccion-proveedor"
          tone="violet"
          icon={Truck}
          title="Proveedor"
          description="No cambia el estado del ticket."
          className="min-w-0 flex-[2_1_300px]"
        >
          <Field id="proveedorId" label="Proveedor" icon={Truck}>
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
            icon={Hash}
            hint={hasProveedor ? undefined : REFERENCIA_SIN_PROVEEDOR}
            error={errors.referenciaExterna && REFERENCIA_ERROR}
          >
            {(aria) => (
              <Input
                id="referenciaExterna"
                placeholder="19092/2026"
                autoComplete="off"
                disabled={!hasProveedor}
                className={monoClass}
                {...aria}
                {...register("referenciaExterna")}
              />
            )}
          </Field>
        </FormSection>
      </div>

      <FormSection
        id="seccion-solucion"
        tone="teal"
        icon={CircleCheckBig}
        title="Solución y seguimiento"
        description="Qué se hizo y si ya se avisó a quien lo pidió."
      >
        <Field
          id="solucionDescripcion"
          label="Descripción de la solución"
          icon={Wrench}
          hint="No es obligatoria, ni siquiera para un estado de cierre."
          counter={{ value: (watch("solucionDescripcion") ?? "").length, max: 5000 }}
          error={errors.solucionDescripcion && "Hasta 5000 caracteres."}
        >
          {(aria) => (
            <Textarea
              id="solucionDescripcion"
              placeholder="Qué se hizo para resolverlo"
              className={textareaClass}
              {...aria}
              {...register("solucionDescripcion")}
            />
          )}
        </Field>

        <label
          htmlFor="notificado"
          className="form-callout cursor-pointer flex-row items-center gap-3.5"
        >
          <Controller
            control={control}
            name="notificado"
            render={({ field }) => (
              <Checkbox
                id="notificado"
                className="size-5"
                aria-labelledby="notificado-etiqueta"
                aria-describedby="notificado-ayuda"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
            )}
          />
          <span className="flex flex-col gap-0.5">
            <span
              id="notificado-etiqueta"
              className="flex items-center gap-2 text-[13px] font-medium text-foreground"
            >
              <Bell aria-hidden="true" className="size-4 text-(--sc)" />
              Notificado
            </span>
            <span id="notificado-ayuda" className="text-[13px] text-muted-foreground">
              Registra que se avisó a quien hizo el requerimiento. No se marca sola.
            </span>
          </span>
        </label>
      </FormSection>

      <FormActionBar message={message}>
        <Button
          type="button"
          variant="outline"
          className="h-10 px-5"
          onClick={discard}
          disabled={!isDirty || isSubmitting}
        >
          Descartar cambios
        </Button>
        <Button type="submit" className="h-10 px-5" disabled={!isDirty || isSubmitting}>
          {isSubmitting ? "Guardando…" : "Guardar cambios"}
        </Button>
      </FormActionBar>
    </form>
  );
}
