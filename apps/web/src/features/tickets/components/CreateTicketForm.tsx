import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateTicketInput, createTicketInputSchema, hoyArgentina } from "@syc/contracts";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  FileText,
  Flag,
  Hash,
  Lock,
  TextAlignStart,
  Ticket,
  Truck,
  Type,
} from "lucide-react";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { FormActionBar } from "@/components/common/FormActionBar";
import { FormSection } from "@/components/common/FormSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useOrganizations } from "@/features/organizations/hooks/useOrganizations";
import { DepartmentSelect } from "@/features/users/components/DepartmentSelect";
import { getErrorMessage } from "@/lib/errors";
import { useCreateTicket } from "../hooks/useTicketMutations";
import { CatalogOptionSelect } from "./CatalogOptionSelect";
import {
  controlClass,
  Field,
  type FieldControlProps,
  selectClass,
  TodayButton,
  textareaClass,
} from "./Field";
import { PrioridadDot } from "./TicketBadges";

// El esquema del contrato acepta "" en los ids (`z.string()`); el formulario exige elegir.
const createTicketFormSchema = createTicketInputSchema
  .refine((v) => v.departamentoId !== "", {
    path: ["departamentoId"],
    message: "Elegí un departamento.",
  })
  .refine((v) => v.prioridadId !== "", {
    path: ["prioridadId"],
    message: "Elegí una prioridad.",
  });

// El formulario trabaja con texto (un campo en blanco es ""); el esquema lo convierte en `null`.
type CreateTicketFormInput = z.input<typeof createTicketInputSchema>;

// Solo el admin elige el departamento: a un agente `organizations.list` le responde 403, así que
// este componente (que lo consulta) solo se monta para el admin.
function AdminDepartmentSelect({
  value,
  onChange,
  ...aria
}: { value: string; onChange: (value: string) => void } & FieldControlProps) {
  const { data: departments = [] } = useOrganizations();
  return (
    <DepartmentSelect
      id="departamentoId"
      value={value}
      onChange={onChange}
      departments={departments}
      invalid={Boolean(aria["aria-invalid"])}
      aria-describedby={aria["aria-describedby"]}
      aria-required={aria["aria-required"]}
      className={selectClass}
    />
  );
}

// El título recibe el foco al abrir la pantalla solo con un puntero fino (mouse): en un celular abriría el
// teclado de golpe. `matchMedia` no existe en jsdom.
const hasFinePointer = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(pointer: fine)").matches;

const DATE_ERROR = "Ingresá una fecha válida, de hoy o anterior.";
const REFERENCIA_ERROR =
  "Usá el formato número/año, por ejemplo 19092/2026 (el año va de 2000 a 2100).";
const REFERENCIA_SIN_PROVEEDOR = "Elegí un proveedor para cargar la referencia.";

interface FormProps {
  isAdmin: boolean;
  // El departamento del agente; el admin no tiene.
  ownDepartment: { id: string; nombre: string } | null;
}

function Form({ isAdmin, ownDepartment }: FormProps) {
  const navigate = useNavigate();
  const create = useCreateTicket();
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CreateTicketFormInput, unknown, CreateTicketInput>({
    resolver: zodResolver(createTicketFormSchema),
    defaultValues: {
      departamentoId: ownDepartment?.id ?? "",
      titulo: "",
      descripcion: "",
      prioridadId: "",
      fechaRecepcion: hoyArgentina(),
      actuacionSimple: "",
      proveedorId: "",
      referenciaExterna: "",
    },
  });
  const hasProveedor = Boolean(watch("proveedorId"));

  const submit = handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      const ticket = await create.mutateAsync(values);
      await navigate({ to: "/tickets/$ticketId", params: { ticketId: ticket.id } });
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  });

  return (
    <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
      <FormSection
        id="seccion-datos"
        tone="brand"
        icon={Ticket}
        title="Datos del ticket"
        description="Qué se pidió y quién lo gestiona."
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
                className={`${controlClass} font-mono text-[15px] md:text-[15px]`}
                {...aria}
                {...register("actuacionSimple")}
              />
            )}
          </Field>

          <Field
            id="departamentoId"
            label="Departamento"
            icon={Building2}
            required={isAdmin}
            hint={isAdmin ? undefined : "Es el departamento de tu cuenta. No se puede cambiar."}
            error={errors.departamentoId?.message}
          >
            {(aria) =>
              isAdmin ? (
                <Controller
                  control={control}
                  name="departamentoId"
                  render={({ field }) => (
                    <AdminDepartmentSelect
                      value={field.value}
                      onChange={field.onChange}
                      {...aria}
                    />
                  )}
                />
              ) : (
                // Un campo de solo lectura, no un texto suelto: así el `<label>` tiene un control al que apuntar.
                <div className="relative">
                  <Lock
                    aria-hidden="true"
                    className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id="departamentoId"
                    value={ownDepartment?.nombre ?? ""}
                    readOnly
                    className={`${controlClass} bg-muted pl-10.5`}
                    {...aria}
                  />
                </div>
              )
            }
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
              autoFocus={hasFinePointer()}
              className={controlClass}
              {...aria}
              {...register("titulo")}
            />
          )}
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            id="prioridadId"
            label="Prioridad"
            icon={Flag}
            required
            error={errors.prioridadId?.message}
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
                    placeholder="Elegí una prioridad"
                    leading={<PrioridadDot id={field.value} />}
                    {...aria}
                  />
                )}
              />
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

      <FormSection
        id="seccion-proveedor"
        tone="violet"
        icon={Truck}
        title="Proveedor"
        description="No cambia el estado del ticket."
      >
        <div className="grid gap-5 sm:grid-cols-2">
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
                      // La referencia es del proveedor: sin proveedor no existe.
                      if (!value) setValue("referenciaExterna", "");
                    }}
                    placeholder="Sin proveedor"
                    emptyLabel="Sin proveedor"
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
                className={`${controlClass} font-mono text-[15px] md:text-[15px]`}
                {...aria}
                {...register("referenciaExterna")}
              />
            )}
          </Field>
        </div>
      </FormSection>

      <FormActionBar
        message={
          serverError && (
            <p role="alert" className="text-destructive">
              {serverError}
            </p>
          )
        }
      >
        <Button variant="outline" className="h-10 px-5" asChild>
          <Link to="/tickets">Cancelar</Link>
        </Button>
        <Button type="submit" className="h-10 px-5" disabled={isSubmitting}>
          {isSubmitting ? "Creando…" : "Crear ticket"}
        </Button>
      </FormActionBar>
    </form>
  );
}

// Alta de un ticket. No pide estado, número, fechas de cierre ni área, edificio, tipo o módulo: el
// estado y el número los pone el servidor, y el resto se completa al editar (Feature 5.1).
export function CreateTicketForm() {
  const { data: user } = useCurrentUser();
  if (!user) return null;
  return <Form isAdmin={user.role === "admin"} ownDepartment={user.department} />;
}
