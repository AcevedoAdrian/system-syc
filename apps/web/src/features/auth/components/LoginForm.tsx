import { zodResolver } from "@hookform/resolvers/zod";
import { type LoginInput, loginInputSchema } from "@syc/contracts";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "../hooks/useLogin";
import { LoginError, type LoginFailure } from "../login-error";

const failureMessages: Record<LoginFailure, { title: string; detail?: string }> = {
  invalid: {
    title: "Usuario o contraseña incorrectos.",
    detail: "Revisá los datos e intentá de nuevo.",
  },
  "rate-limited": {
    title: "Demasiados intentos.",
    detail: "Esperá un minuto antes de volver a intentar.",
  },
  disabled: {
    title: "Tu usuario está desactivado.",
    detail: "Pedí a un administrador que lo reactive.",
  },
  unreachable: { title: "No se pudo conectar con el servidor." },
};

// Los campos del login miden 40px y llevan el texto a 16px, como en la maqueta.
const fieldClass = "h-10 rounded-lg px-3.5 text-base md:text-base";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const login = useLogin();
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginInputSchema) });

  const failure = login.error instanceof LoginError ? login.error.failure : undefined;
  const message = failure ? failureMessages[failure] : undefined;

  return (
    <section aria-labelledby="login-title" className="flex w-full max-w-95 flex-col gap-6">
      <div>
        <h1
          id="login-title"
          className="font-heading text-4xl leading-[1.15] font-medium tracking-[-0.02em]"
        >
          Iniciar sesión
        </h1>
        <p className="mt-1 text-base text-muted-foreground">Ingresá con tu usuario y contraseña.</p>
      </div>
      {message && (
        <div
          role="alert"
          className="rounded-lg border border-destructive bg-background px-5 py-4 text-foreground"
        >
          <span className="font-medium">{message.title}</span>
          {message.detail && ` ${message.detail}`}
        </div>
      )}
      <form
        className="flex flex-col gap-6"
        onSubmit={handleSubmit((values) => login.mutate(values, { onSuccess }))}
        noValidate
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="username" className="text-[13px] text-foreground">
            Usuario
          </Label>
          <Input
            id="username"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            className={fieldClass}
            aria-invalid={errors.username ? true : undefined}
            aria-describedby={errors.username ? "username-error" : undefined}
            {...register("username")}
          />
          {errors.username && (
            <p id="username-error" className="text-[13px] text-destructive">
              Ingresá tu usuario.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-[13px] text-foreground">
            Contraseña
          </Label>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className={`${fieldClass} pr-21`}
              aria-invalid={errors.password ? true : undefined}
              aria-describedby={errors.password ? "password-error" : undefined}
              {...register("password")}
            />
            <Button
              type="button"
              variant="ghost"
              className="absolute top-1 right-1 h-8 px-2.5 text-[13px] text-muted-foreground"
              aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
              onClick={() => setShowPassword((shown) => !shown)}
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </Button>
          </div>
          {errors.password && (
            <p id="password-error" className="text-[13px] text-destructive">
              Ingresá tu contraseña.
            </p>
          )}
        </div>
        <Button type="submit" className="h-10 w-full" disabled={login.isPending}>
          {login.isPending ? "Ingresando…" : "Ingresar"}
        </Button>
      </form>
      <p className="border-t border-dashed pt-5 text-[13px] text-muted-foreground">
        ¿No tenés acceso? Un administrador da de alta a cada usuario.
      </p>
    </section>
  );
}
