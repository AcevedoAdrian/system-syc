import { zodResolver } from "@hookform/resolvers/zod";
import { type ResetPasswordInput, resetPasswordInputSchema, type User } from "@syc/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { controlClass, Field } from "@/components/common/Field";
import { DrawerForm, FormDrawer } from "@/components/common/FormDrawer";
import { Input } from "@/components/ui/input";
import { getErrorMessage } from "@/lib/errors";

const passwordSchema = resetPasswordInputSchema.pick({ password: true });
type PasswordValues = Pick<ResetPasswordInput, "password">;

interface ResetPasswordDialogProps {
  user: User | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: ResetPasswordInput) => Promise<unknown>;
}

function ResetPasswordForm({
  user,
  onSubmit,
  onDone,
}: Pick<ResetPasswordDialogProps, "onSubmit"> & { user: User; onDone: () => void }) {
  const [serverError, setServerError] = useState<string>();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: "" },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      await onSubmit({ userId: user.id, password: values.password });
      onDone();
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  });

  return (
    <DrawerForm
      onSubmit={submit}
      submitLabel="Resetear contraseña"
      submitting={isSubmitting}
      error={serverError}
    >
      <p className="text-body">
        Vas a definir una contraseña nueva para <span className="font-medium">{user.name}</span>. Se
        cerrarán sus sesiones activas y no hace falta conocer la anterior.
      </p>
      <Field
        id="new-password"
        label="Nueva contraseña"
        required
        error={errors.password && "Debe tener entre 8 y 128 caracteres."}
      >
        {(aria) => (
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            autoFocus
            maxLength={128}
            className={controlClass}
            {...aria}
            {...register("password")}
          />
        )}
      </Field>
    </DrawerForm>
  );
}

// Un panel lateral (SPEC 09, 9.6) para resetear la contraseña de un usuario.
export function ResetPasswordDialog({ user, onOpenChange, onSubmit }: ResetPasswordDialogProps) {
  return (
    <FormDrawer
      open={user !== null}
      onOpenChange={onOpenChange}
      title="Resetear contraseña"
      description="Define una contraseña nueva para la cuenta."
    >
      {user && (
        <ResetPasswordForm user={user} onSubmit={onSubmit} onDone={() => onOpenChange(false)} />
      )}
    </FormDrawer>
  );
}
