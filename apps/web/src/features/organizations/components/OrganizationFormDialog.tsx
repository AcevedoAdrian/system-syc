import { zodResolver } from "@hookform/resolvers/zod";
import { type OrganizationInput, organizationInputSchema } from "@syc/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { controlClass, Field } from "@/components/common/Field";
import { DrawerForm, FormDrawer } from "@/components/common/FormDrawer";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";

interface OrganizationFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initialName?: string;
  onSubmit: (values: OrganizationInput) => Promise<unknown>;
}

function OrganizationForm({
  submitLabel,
  initialName,
  onSubmit,
  onDone,
}: Omit<OrganizationFormDialogProps, "open" | "onOpenChange" | "title"> & { onDone: () => void }) {
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OrganizationInput>({
    resolver: zodResolver(organizationInputSchema),
    defaultValues: { nombre: initialName ?? "" },
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
        hint="El nombre no puede repetirse entre departamentos."
        error={errors.nombre && "El nombre es obligatorio (hasta 120 caracteres)."}
      >
        {(aria) => (
          <Input
            id="nombre"
            autoFocus
            maxLength={120}
            className={controlClass}
            {...aria}
            {...register("nombre")}
          />
        )}
      </Field>
    </DrawerForm>
  );
}

// Un panel lateral (SPEC 09, 9.6) para dar de alta o renombrar un departamento.
export function OrganizationFormDialog({
  open,
  onOpenChange,
  title,
  ...formProps
}: OrganizationFormDialogProps) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Los agentes pertenecen a un departamento y ven solo sus tickets."
    >
      <OrganizationForm {...formProps} onDone={() => onOpenChange(false)} />
    </FormDrawer>
  );
}
