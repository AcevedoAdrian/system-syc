import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateTicketInput, createTicketInputSchema, hoyArgentina } from "@syc/contracts";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useOrganizations } from "@/features/organizations/hooks/useOrganizations";
import { DepartmentSelect } from "@/features/users/components/DepartmentSelect";
import { getErrorMessage } from "@/lib/errors";
import { useCreateTicket } from "../hooks/useTicketMutations";
import { CatalogOptionSelect } from "./CatalogOptionSelect";

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

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// Solo el admin elige el departamento: a un agente `organizations.list` le responde 403, así que
// este componente (que lo consulta) solo se monta para el admin.
function AdminDepartmentSelect({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const { data: departments = [] } = useOrganizations();
  return (
    <DepartmentSelect
      id="departamentoId"
      value={value}
      onChange={onChange}
      departments={departments}
      invalid={invalid}
    />
  );
}

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
    <form className="flex max-w-2xl flex-col gap-4" onSubmit={submit} noValidate>
      <Field id="departamentoId" label="Departamento" error={errors.departamentoId?.message}>
        {isAdmin ? (
          <Controller
            control={control}
            name="departamentoId"
            render={({ field }) => (
              <AdminDepartmentSelect
                value={field.value}
                onChange={field.onChange}
                invalid={Boolean(errors.departamentoId)}
              />
            )}
          />
        ) : (
          <p id="departamentoId" className="text-sm">
            {ownDepartment?.nombre}
          </p>
        )}
      </Field>

      <Field
        id="titulo"
        label="Título"
        error={errors.titulo && "El título es obligatorio (hasta 200 caracteres)."}
      >
        <Input
          id="titulo"
          autoFocus
          aria-invalid={errors.titulo ? true : undefined}
          {...register("titulo")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="prioridadId" label="Prioridad" error={errors.prioridadId?.message}>
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
                invalid={Boolean(errors.prioridadId)}
              />
            )}
          />
        </Field>
        <Field
          id="fechaRecepcion"
          label="Fecha de recepción"
          error={errors.fechaRecepcion && "Ingresá una fecha válida, de hoy o anterior."}
        >
          <Input
            id="fechaRecepcion"
            type="date"
            max={hoyArgentina()}
            aria-invalid={errors.fechaRecepcion ? true : undefined}
            {...register("fechaRecepcion")}
          />
        </Field>
      </div>

      <Field
        id="descripcion"
        label="Descripción"
        error={errors.descripcion && "Hasta 5000 caracteres."}
      >
        <Textarea
          id="descripcion"
          rows={4}
          aria-invalid={errors.descripcion ? true : undefined}
          {...register("descripcion")}
        />
      </Field>

      <Field
        id="actuacionSimple"
        label="Actuación simple"
        error={errors.actuacionSimple && "Hasta 500 caracteres."}
      >
        <Input
          id="actuacionSimple"
          aria-invalid={errors.actuacionSimple ? true : undefined}
          {...register("actuacionSimple")}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="proveedorId" label="Proveedor">
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
              />
            )}
          />
        </Field>
        <Field
          id="referenciaExterna"
          label="Referencia externa"
          error={
            errors.referenciaExterna &&
            "Usá el formato número/año, por ejemplo 19092/2026 (el año va de 2000 a 2100)."
          }
        >
          <Input
            id="referenciaExterna"
            placeholder="19092/2026"
            disabled={!hasProveedor}
            aria-invalid={errors.referenciaExterna ? true : undefined}
            {...register("referenciaExterna")}
          />
        </Field>
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          Crear ticket
        </Button>
      </div>
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
