import { zodResolver } from "@hookform/resolvers/zod";
import { type ProveedorInput, proveedorInputSchema } from "@syc/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
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
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import type { CatalogEntry } from "../hooks/catalog-api";

// El formulario trabaja con texto (un campo en blanco es ""); el esquema del contrato lo convierte
// en `null` al validar.
type ProveedorFormInput = z.input<typeof proveedorInputSchema>;

type OptionalField = "contacto" | "telefono" | "correo" | "sitioWeb";

const OPTIONAL_FIELDS: { name: OptionalField; label: string; error: string; type?: string }[] = [
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
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          id="nombre"
          autoFocus
          aria-invalid={errors.nombre ? true : undefined}
          {...register("nombre")}
        />
        {errors.nombre && (
          <p className="text-sm text-destructive">
            El nombre es obligatorio (hasta 120 caracteres).
          </p>
        )}
      </div>
      {OPTIONAL_FIELDS.map((field) => (
        <div key={field.name} className="flex flex-col gap-1.5">
          <Label htmlFor={field.name}>{field.label}</Label>
          <Input
            id={field.name}
            type={field.type}
            aria-invalid={errors[field.name] ? true : undefined}
            {...register(field.name)}
          />
          {errors[field.name] && <p className="text-sm text-destructive">{field.error}</p>}
        </div>
      ))}
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ProveedorFormDialog({
  open,
  onOpenChange,
  title,
  ...formProps
}: ProveedorFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Solo el nombre es obligatorio y no puede repetirse entre proveedores.
          </DialogDescription>
        </DialogHeader>
        <ProveedorForm {...formProps} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
