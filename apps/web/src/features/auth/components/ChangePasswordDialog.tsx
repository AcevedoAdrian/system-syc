import { zodResolver } from "@hookform/resolvers/zod";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChangePassword } from "../hooks/useChangePassword";
import { type ChangePasswordFormValues, changePasswordFormSchema } from "../schemas";

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const changePassword = useChangePassword();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <p role="status">Contraseña actualizada. Tus otras sesiones se cerraron.</p>
        <DialogFooter>
          <Button onClick={onDone}>Cerrar</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit(({ currentPassword, newPassword }) =>
        changePassword.mutate({ currentPassword, newPassword }, { onSuccess: () => setDone(true) }),
      )}
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">Contraseña actual</Label>
        <Input
          id="current-password"
          type="password"
          autoComplete="current-password"
          autoFocus
          aria-invalid={errors.currentPassword ? true : undefined}
          {...register("currentPassword")}
        />
        {errors.currentPassword && (
          <p className="text-sm text-destructive">Ingresá tu contraseña actual.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">Contraseña nueva</Label>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.newPassword ? true : undefined}
          {...register("newPassword")}
        />
        {errors.newPassword && (
          <p className="text-sm text-destructive">Debe tener entre 8 y 128 caracteres.</p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">Repetí la contraseña nueva</Label>
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          aria-invalid={errors.confirmPassword ? true : undefined}
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-sm text-destructive">Las contraseñas no coinciden.</p>
        )}
      </div>
      {changePassword.error && (
        <p role="alert" className="text-sm text-destructive">
          {changePassword.error.message}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={changePassword.isPending}>
          Cambiar contraseña
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ChangePasswordDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Cambiar mi contraseña
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar mi contraseña</DialogTitle>
          <DialogDescription>
            Necesitás tu contraseña actual. Se cerrarán tus otras sesiones abiertas.
          </DialogDescription>
        </DialogHeader>
        <ChangePasswordForm onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
