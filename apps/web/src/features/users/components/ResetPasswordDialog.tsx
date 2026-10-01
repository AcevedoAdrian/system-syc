import { zodResolver } from "@hookform/resolvers/zod";
import { type ResetPasswordInput, resetPasswordInputSchema, type User } from "@syc/contracts";
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
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">Nueva contraseña</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          autoFocus
          aria-invalid={errors.password ? true : undefined}
          {...register("password")}
        />
        {errors.password && (
          <p className="text-sm text-destructive">Debe tener entre 8 y 128 caracteres.</p>
        )}
      </div>
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          Resetear contraseña
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ResetPasswordDialog({ user, onOpenChange, onSubmit }: ResetPasswordDialogProps) {
  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resetear contraseña</DialogTitle>
          <DialogDescription>
            {user && `Vas a definir una contraseña nueva para ${user.name}. `}
            Se cerrarán sus sesiones activas y no hace falta conocer la anterior.
          </DialogDescription>
        </DialogHeader>
        {user && (
          <ResetPasswordForm user={user} onSubmit={onSubmit} onDone={() => onOpenChange(false)} />
        )}
      </DialogContent>
    </Dialog>
  );
}
