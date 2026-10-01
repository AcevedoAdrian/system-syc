import { zodResolver } from "@hookform/resolvers/zod";
import { type OrganizationInput, organizationInputSchema } from "@syc/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
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

export function OrganizationFormDialog({
  open,
  onOpenChange,
  title,
  ...formProps
}: OrganizationFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>El nombre no puede repetirse entre departamentos.</DialogDescription>
        </DialogHeader>
        <OrganizationForm {...formProps} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
