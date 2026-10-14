import { createFileRoute, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { safeRedirectPath } from "@/features/auth/redirect";

function LoginPage() {
  const router = useRouter();
  const { redirect } = Route.useSearch();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="font-display text-[40px] leading-[1.1] font-medium tracking-[-0.02em]">
          system-syc
        </h1>
        <p className="text-sm text-muted-foreground">Gestión interna y seguimiento de tickets</p>
      </div>
      <LoginForm onSuccess={() => router.history.push(safeRedirectPath(redirect) ?? "/")} />
    </main>
  );
}

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
});
