import { zodResolver } from "@hookform/resolvers/zod";
import { type ProveedorInput, proveedorInputSchema } from "@syc/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { controlClass, Field } from "@/components/common/Field";
import { DrawerForm, FormDrawer } from "@/components/common/FormDrawer";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";
import type { CatalogEntry } from "../hooks/catalog-api";

// El formulario trabaja con texto (un campo en blanco es ""); el esquema del contrato lo convierte
// en `null` al validar.
type ProveedorFormInput = z.input<typeof proveedorInputSchema>;

type OptionalField = "contacto" | "telefono" | "correo" | "sitioWeb";

const OPTIONAL_FIELDS: {
  name: OptionalField;
  label: string;
  error: string;
  type?: string;
  placeholder?: string;
}[] = [
  { name: "contacto", label: "Contacto", error: "Hasta 120 caracteres." },
  { name: "telefono", label: "Teléfono", error: "Hasta 50 caracteres." },
  {
    name: "correo",
    label: "Correo",
    error: "Ingresá un correo válido, por ejemplo soporte@proveedor.com.",
    type: "email",
  },
  {
    name: "sitioWeb",
    label: "Sitio web",
    error: "Ingresá una dirección que empiece con http:// o https://.",
    placeholder: "https://",
  },
];

interface ProveedorFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initial?: CatalogEntry | null;
  onSubmit: (values: ProveedorInput) => Promise<unknown>;
}

function ProveedorForm({
  submitLabel,
  initial,
  onSubmit,
  onDone,
}: Omit<ProveedorFormDialogProps, "open" | "onOpenChange" | "title"> & { onDone: () => void }) {
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProveedorFormInput, unknown, ProveedorInput>({
    resolver: zodResolver(proveedorInputSchema),
    defaultValues: {
      nombre: initial?.nombre ?? "",
      contacto: initial?.contacto ?? "",
      telefono: initial?.telefono ?? "",
      correo: initial?.correo ?? "",
      sitioWeb: initial?.sitioWeb ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      await onSubmit(values);
      onDone();
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  });

  return (
    <DrawerForm
      onSubmit={submit}
      submitLabel={submitLabel}
      submitting={isSubmitting}
      error={serverError}
    >
      <Field
        id="nombre"
        label="Nombre"
        required
        hint="Solo el nombre es obligatorio y no puede repetirse entre proveedores."
        error={errors.nombre && "El nombre es obligatorio (hasta 120 caracteres)."}
      >
        {(aria) => (
          <Input
            id="nombre"
            autoFocus
            maxLength={120}
            placeholder="Nombre del registro"
            className={controlClass}
            {...aria}
            {...register("nombre")}
          />
        )}
      </Field>
      {OPTIONAL_FIELDS.map((field) => (
        <Field
          key={field.name}
          id={field.name}
          label={field.label}
          hint={errors[field.name] ? undefined : "Opcional."}
          error={errors[field.name] && field.error}
        >
          {(aria) => (
            <Input
              id={field.name}
              type={field.type}
              placeholder={field.placeholder}
              className={controlClass}
              {...aria}
              {...register(field.name)}
            />
          )}
        </Field>
      ))}
    </DrawerForm>
  );
}

// Un panel lateral (SPEC 09, 9.6) para dar de alta o editar un proveedor.
export function ProveedorFormDialog({
  open,
  onOpenChange,
  title,
  ...formProps
}: ProveedorFormDialogProps) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Alta o edición de un proveedor."
    >
      <ProveedorForm {...formProps} onDone={() => onOpenChange(false)} />
    </FormDrawer>
  );
}
