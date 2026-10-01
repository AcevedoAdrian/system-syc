import { zodResolver } from "@hookform/resolvers/zod";
import {
  type Organization,
  type UpdateUserInput,
  type User,
  updateUserInputSchema,
} from "@syc/contracts";
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

const editSchema = updateUserInputSchema.omit({ userId: true });
type EditValues = Omit<UpdateUserInput, "userId">;

interface EditUserDialogProps {
  user: User | null;
  onOpenChange: (open: boolean) => void;
  departments: Organization[];
  onSubmit: (values: UpdateUserInput) => Promise<unknown>;
}

// En el formulario un email vacío es `null`: vuelve al email interno (D4).
const emptyToNull = (value: unknown) => (value === "" ? null : value);

function EditUserForm({
  user,
  departments,
  onSubmit,
  onDone,
}: Omit<EditUserDialogProps, "user" | "onOpenChange"> & { user: User; onDone: () => void }) {
  const [serverError, setServerError] = useState<string>();
  const currentDepartment = departments.find((d) => d.id === user.department?.id);
  const {
    register,
    control,
    watch,
    setValue,
    setError,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      username: user.username,
      name: user.name,
      email: user.email,
      role: user.role,
      // Si su departamento actual está desactivado, el selector queda vacío y no se cambia.
      organizationId: currentDepartment?.activo ? currentDepartment.id : undefined,
    },
  });
  const role = watch("role") ?? user.role;

  const submit = handleSubmit(async (values) => {
    setServerError(undefined);
    const needsDepartment = values.role === "agente" && user.department === null;
    if (needsDepartment && !values.organizationId) {
      setError("organizationId", { message: "required" });
      return;
    }
    try {
      await onSubmit({
        ...values,
        userId: user.id,
        organizationId: values.role === "admin" ? undefined : values.organizationId,
      });
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
          aria-invalid={errors.username ? true : undefined}
          {...register("username")}
        />
        <p className="text-xs text-muted-foreground">
          Cambiarlo modifica el nombre con el que la persona inicia sesión.
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
          {...register("email", { setValueAs: emptyToNull })}
        />
        {errors.email && <p className="text-sm text-destructive">El email no es válido.</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="role">Rol</Label>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <RoleSelect
              id="role"
              value={field.value ?? user.role}
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
                placeholder={
                  user.department
                    ? `${user.department.nombre} (desactivado)`
                    : "Elegí un departamento"
                }
                invalid={Boolean(errors.organizationId)}
              />
            )}
          />
          {errors.organizationId && (
            <p className="text-sm text-destructive">Elegí un departamento para el agente.</p>
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
          Guardar
        </Button>
      </DialogFooter>
    </form>
  );
}

export function EditUserDialog({ user, onOpenChange, ...formProps }: EditUserDialogProps) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
          <DialogDescription>
            Un agente tiene exactamente un departamento; un administrador, ninguno.
          </DialogDescription>
        </DialogHeader>
        {user && <EditUserForm {...formProps} user={user} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
