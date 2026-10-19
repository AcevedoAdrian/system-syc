import { useRouterState } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { ThemeToggle } from "@/components/common/ThemeToggle";
import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "@/features/auth/components/ChangePasswordDialog";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useLogout } from "@/features/auth/hooks/useLogout";
import { breadcrumbFor, catalogoFromSearch, initialsOf } from "./navigation";

export function Topbar() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  const { pathname, search } = useRouterState({ select: (state) => state.location });
  const breadcrumb = breadcrumbFor(pathname, catalogoFromSearch(search));

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b bg-background px-8">
      {breadcrumb ? (
        <nav aria-label="Migas de pan" className="flex items-center gap-2 text-sm font-medium">
          <span className="text-muted-foreground">{breadcrumb.parent}</span>
          <span className="text-muted-foreground" aria-hidden="true">
            /
          </span>
          <span className="text-foreground" aria-current="page">
            {breadcrumb.current}
          </span>
        </nav>
      ) : (
        <div />
      )}
      <div className="flex items-center gap-3">
        <ThemeToggle />
        <div className="flex items-center gap-2.5">
          <div
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-full bg-card text-[13px] font-medium text-foreground"
          >
            {initialsOf(user?.name)}
          </div>
          <span className="font-medium text-foreground" data-testid="topbar-user">
            {user?.name}
          </span>
        </div>
        <ChangePasswordDialog />
        <Button
          type="button"
          variant="outline"
          className="size-10 rounded-full text-foreground"
          aria-label="Cerrar sesión"
          title="Cerrar sesión"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          <LogOut aria-hidden="true" />
        </Button>
      </div>
    </header>
  );
}
