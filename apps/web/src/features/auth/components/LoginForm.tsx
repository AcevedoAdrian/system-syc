import { zodResolver } from "@hookform/resolvers/zod";
import { type LoginInput, loginInputSchema } from "@syc/contracts";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "../hooks/useLogin";
import { LoginError, type LoginFailure } from "../login-error";

const failureMessages: Record<LoginFailure, string> = {
  invalid: "Usuario o contraseña incorrectos.",
  "rate-limited": "Demasiados intentos. Esperá un minuto antes de volver a intentar.",
  disabled: "Tu usuario está desactivado. Consultá con un administrador.",
  unreachable: "No se pudo conectar con el servidor.",
};

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const login = useLogin();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginInput>({ resolver: zodResolver(loginInputSchema) });

  const failure = login.error instanceof LoginError ? login.error.failure : undefined;

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={handleSubmit((values) => login.mutate(values, { onSuccess }))}
          noValidate
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="username">Usuario</Label>
            <Input
              id="username"
              autoComplete="username"
              autoFocus
              aria-invalid={errors.username ? true : undefined}
              {...register("username")}
            />
            {errors.username && <p className="text-sm text-destructive">Ingresá tu usuario.</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Contraseña</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              {...register("password")}
            />
            {errors.password && <p className="text-sm text-destructive">Ingresá tu contraseña.</p>}
          </div>
          {failure && (
            <p role="alert" className="text-sm text-destructive">
              {failureMessages[failure]}
            </p>
          )}
          <Button type="submit" disabled={login.isPending}>
            {login.isPending ? "Ingresando…" : "Ingresar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
