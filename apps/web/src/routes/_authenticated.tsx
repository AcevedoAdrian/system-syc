import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { getCurrentUser } from "@/features/auth/session";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw redirect({ to: "/login", search: { redirect: location.href } });
    return { currentUser };
  },
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
