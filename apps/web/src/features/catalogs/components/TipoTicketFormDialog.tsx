import { zodResolver } from "@hookform/resolvers/zod";
import { type TipoTicketInput, tipoTicketInputSchema } from "@syc/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import { controlClass, Field, textareaClass } from "@/components/common/Field";
import { DrawerForm, FormDrawer } from "@/components/common/FormDrawer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { getErrorMessage } from "@/lib/errors";
import type { CatalogEntry } from "../hooks/catalog-api";

// El formulario trabaja con texto (una descripción en blanco es ""); el esquema del contrato la
// convierte en `null` al validar.
type TipoTicketFormInput = z.input<typeof tipoTicketInputSchema>;

const DESCRIPCION_MAX = 500;

interface TipoTicketFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initial?: CatalogEntry | null;
  onSubmit: (values: TipoTicketInput) => Promise<unknown>;
}

function TipoTicketForm({
  submitLabel,
  initial,
  onSubmit,
  onDone,
}: Omit<TipoTicketFormDialogProps, "open" | "onOpenChange" | "title"> & { onDone: () => void }) {
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TipoTicketFormInput, unknown, TipoTicketInput>({
    resolver: zodResolver(tipoTicketInputSchema),
    defaultValues: { nombre: initial?.nombre ?? "", descripcion: initial?.descripcion ?? "" },
  });
  const descripcion = watch("descripcion");

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
        hint="No puede repetirse entre tipos de ticket."
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
      <Field
        id="descripcion"
        label="Descripción"
        hint={errors.descripcion ? undefined : "Opcional. Se muestra como ayuda al elegir el tipo."}
        counter={{ value: descripcion?.length ?? 0, max: DESCRIPCION_MAX }}
        error={errors.descripcion && `Hasta ${DESCRIPCION_MAX} caracteres.`}
      >
        {(aria) => (
          <Textarea
            id="descripcion"
            placeholder="Cuándo usar este tipo, con un ejemplo"
            className={textareaClass}
            {...aria}
            {...register("descripcion")}
          />
        )}
      </Field>
    </DrawerForm>
  );
}

// Un panel lateral (SPEC 09, 9.6) para dar de alta o editar un tipo de ticket (SPEC 12).
export function TipoTicketFormDialog({
  open,
  onOpenChange,
  title,
  ...formProps
}: TipoTicketFormDialogProps) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Alta o edición de un tipo de ticket."
    >
      <TipoTicketForm {...formProps} onDone={() => onOpenChange(false)} />
    </FormDrawer>
  );
}
