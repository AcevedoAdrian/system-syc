import { createFileRoute, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { LoginForm } from "@/features/auth/components/LoginForm";
import { safeRedirectPath } from "@/features/auth/redirect";

function LoginPage() {
  const router = useRouter();
  const { redirect } = Route.useSearch();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <LoginForm onSuccess={() => router.history.push(safeRedirectPath(redirect) ?? "/")} />
    </main>
  );
}

export const Route = createFileRoute("/login")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: LoginPage,
});
