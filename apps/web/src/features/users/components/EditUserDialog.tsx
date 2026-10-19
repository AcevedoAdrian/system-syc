import { zodResolver } from "@hookform/resolvers/zod";
import {
  type Organization,
  type UpdateUserInput,
  type User,
  updateUserInputSchema,
} from "@syc/contracts";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { controlClass, Field, selectClass } from "@/components/common/Field";
import { DrawerForm, FormDrawer } from "@/components/common/FormDrawer";
import { Input } from "@/components/ui/input";
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
    <DrawerForm
      onSubmit={submit}
      submitLabel="Guardar"
      submitting={isSubmitting}
      error={serverError}
    >
      <Field
        id="username"
        label="Usuario"
        required
        hint="Cambiarlo modifica el nombre con el que la persona inicia sesión."
        error={errors.username && "El usuario no es válido."}
      >
        {(aria) => (
          <Input
            id="username"
            autoComplete="off"
            autoFocus
            maxLength={30}
            className={`${controlClass} font-mono text-[15px] md:text-[15px]`}
            {...aria}
            {...register("username")}
          />
        )}
      </Field>
      <Field id="name" label="Nombre" required error={errors.name && "El nombre es obligatorio."}>
        {(aria) => (
          <Input
            id="name"
            maxLength={120}
            className={controlClass}
            {...aria}
            {...register("name")}
          />
        )}
      </Field>
      <Field id="email" label="Email (opcional)" error={errors.email && "El email no es válido."}>
        {(aria) => (
          <Input
            id="email"
            type="email"
            autoComplete="off"
            maxLength={254}
            className={controlClass}
            {...aria}
            {...register("email", { setValueAs: emptyToNull })}
          />
        )}
      </Field>
      <Field
        id="role"
        label="Rol"
        required
        hint="Un agente tiene exactamente un departamento; un administrador, ninguno."
      >
        {(aria) => (
          <Controller
            control={control}
            name="role"
            render={({ field }) => (
              <RoleSelect
                id="role"
                {...aria}
                value={field.value ?? user.role}
                onChange={(next) => {
                  field.onChange(next);
                  if (next === "admin") setValue("organizationId", undefined);
                }}
              />
            )}
          />
        )}
      </Field>
      {role === "agente" && (
        <Field
          id="organizationId"
          label="Departamento"
          required
          error={errors.organizationId && "Elegí un departamento para el agente."}
        >
          {(aria) => (
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
                  aria-describedby={aria["aria-describedby"]}
                  aria-required={aria["aria-required"]}
                  className={selectClass}
                />
              )}
            />
          )}
        </Field>
      )}
    </DrawerForm>
  );
}

// Un panel lateral (SPEC 09, 9.6) para editar un usuario.
export function EditUserDialog({ user, onOpenChange, ...formProps }: EditUserDialogProps) {
  return (
    <FormDrawer
      open={user !== null}
      onOpenChange={onOpenChange}
      title="Editar usuario"
      description="Datos de la cuenta de acceso al sistema."
    >
      {user && <EditUserForm {...formProps} user={user} onDone={() => onOpenChange(false)} />}
    </FormDrawer>
  );
}
