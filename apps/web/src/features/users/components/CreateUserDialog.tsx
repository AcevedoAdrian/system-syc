import { zodResolver } from "@hookform/resolvers/zod";
import { type CreateUserInput, createUserInputSchema, type Organization } from "@syc/contracts";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { controlClass, Field, selectClass } from "@/components/common/Field";
import { DrawerForm, FormDrawer } from "@/components/common/FormDrawer";
import { Input } from "@/components/ui/input";
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
    <DrawerForm
      onSubmit={submit}
      submitLabel="Crear usuario"
      submitting={isSubmitting}
      error={serverError}
    >
      <Field
        id="username"
        label="Usuario"
        required
        hint="De 3 a 30 caracteres: letras, números, guion bajo y punto."
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
      <Field
        id="email"
        label="Email (opcional)"
        hint="Si lo dejás vacío se usa uno interno, sin uso funcional."
        error={errors.email && "El email no es válido."}
      >
        {(aria) => (
          <Input
            id="email"
            type="email"
            autoComplete="off"
            maxLength={254}
            className={controlClass}
            {...aria}
            {...register("email", { setValueAs: emptyToUndefined })}
          />
        )}
      </Field>
      <Field
        id="password"
        label="Contraseña"
        required
        hint="Vos definís la contraseña; el usuario puede cambiarla después."
        error={errors.password && "Debe tener entre 8 y 128 caracteres."}
      >
        {(aria) => (
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            className={controlClass}
            {...aria}
            {...register("password")}
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
                value={field.value}
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
          error={errors.organizationId && "Un agente debe tener un departamento."}
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

// Un panel lateral (SPEC 09, 9.6) para dar de alta un usuario.
export function CreateUserDialog({ open, onOpenChange, ...formProps }: CreateUserDialogProps) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo usuario"
      description="Alta de una cuenta de acceso al sistema."
    >
      <CreateUserForm {...formProps} onDone={() => onOpenChange(false)} />
    </FormDrawer>
  );
}
