import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateUserInput, createUserInputSchema, type Organization } from "@syc/contracts";
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
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { DepartmentSelect } from "./DepartmentSelect";
import { RoleSelect } from "./RoleSelect";

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departments: Organization[];
  onSubmit: (values: CreateUserInput) => Promise<unknown>;
}

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

function CreateUserForm({
  departments,
  onSubmit,
  onDone,
}: Omit<CreateUserDialogProps, "open" | "onOpenChange"> & { onDone: () => void }) {
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    control,
    watch,
    setValue,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CreateUserInput>({
    resolver: zodResolver(createUserInputSchema),
    defaultValues: { username: "", name: "", password: "", role: "agente" },
  });
  const role = watch("role");

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
        <Label htmlFor="username">Usuario</Label>
        <Input
          id="username"
          autoComplete="off"
          autoFocus
          aria-invalid={errors.username ? true : undefined}
          {...register("username")}
        />
        <p className="text-xs text-muted-foreground">
          De 3 a 30 caracteres: letras, números, guion bajo y punto.
        </p>
        {errors.username && <p className="text-sm text-destructive">El usuario no es válido.</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" aria-invalid={errors.name ? true : undefined} {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">El nombre es obligatorio.</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email (opcional)</Label>
        <Input
          id="email"
          type="email"
          autoComplete="off"
          aria-invalid={errors.email ? true : undefined}
          {...register("email", { setValueAs: emptyToUndefined })}
        />
        {errors.email && <p className="text-sm text-destructive">El email no es válido.</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.password ? true : undefined}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">Debe tener entre 8 y 128 caracteres.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Rol</Label>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <RoleSelect
              id="role"
              value={field.value}
              onChange={(next) => {
                field.onChange(next);
                if (next === "admin") setValue("organizationId", undefined);
              }}
            />
          )}
        />
      </div>
      {role === "agente" && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="organizationId">Departamento</Label>
          <Controller
            control={control}
            name="organizationId"
            render={({ field }) => (
              <DepartmentSelect
                id="organizationId"
                value={field.value}
                onChange={field.onChange}
                departments={departments}
                invalid={Boolean(errors.organizationId)}
              />
            )}
          />
          {errors.organizationId && (
            <p className="text-sm text-destructive">Un agente debe tener un departamento.</p>
          )}
        </div>
      )}
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          Crear usuario
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CreateUserDialog({ open, onOpenChange, ...formProps }: CreateUserDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>
            Vos definís la contraseña; el usuario puede cambiarla después.
          </DialogDescription>
        </DialogHeader>
        <CreateUserForm {...formProps} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
