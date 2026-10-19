import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { controlClass, Field } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useChangePassword } from "../hooks/useChangePassword";
import { type ChangePasswordFormValues, changePasswordFormSchema } from "../schemas";

function ChangePasswordForm({ onDone }: { onDone: () => void }) {
  const changePassword = useChangePassword();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ChangePasswordFormValues>({
    resolver: zodResolver(changePasswordFormSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <p role="status" className="text-body">
          Contraseña actualizada. Tus otras sesiones se cerraron.
        </p>
        <DialogFooter>
          <Button onClick={onDone}>Cerrar</Button>
        </DialogFooter>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={handleSubmit(({ currentPassword, newPassword }) =>
        changePassword.mutate({ currentPassword, newPassword }, { onSuccess: () => setDone(true) }),
      )}
      noValidate
    >
      <Field
        id="current-password"
        label="Contraseña actual"
        required
        error={errors.currentPassword && "Ingresá tu contraseña actual."}
      >
        {(aria) => (
          <Input
            id="current-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            className={controlClass}
            {...aria}
            {...register("currentPassword")}
          />
        )}
      </Field>
      <Field
        id="new-password"
        label="Contraseña nueva"
        required
        error={errors.newPassword && "Debe tener entre 8 y 128 caracteres."}
      >
        {(aria) => (
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            className={controlClass}
            {...aria}
            {...register("newPassword")}
          />
        )}
      </Field>
      <Field
        id="confirm-password"
        label="Repetí la contraseña nueva"
        required
        error={errors.confirmPassword && "Las contraseñas no coinciden."}
      >
        {(aria) => (
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            maxLength={128}
            className={controlClass}
            {...aria}
            {...register("confirmPassword")}
          />
        )}
      </Field>
      {changePassword.error && (
        <p role="alert" className="text-[13px] text-destructive">
          {changePassword.error.message}
        </p>
      )}
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline" className="h-10 px-5">
            Cancelar
          </Button>
        </DialogClose>
        <Button type="submit" disabled={isSubmitting || changePassword.isPending}>
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
        <Button
          type="button"
          variant="outline"
          className="size-10 rounded-full text-foreground"
          aria-label="Cambiar mi contraseña"
          title="Cambiar mi contraseña"
        >
          <Lock aria-hidden="true" />
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
