import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "@/features/auth/components/ChangePasswordDialog";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useLogout } from "@/features/auth/hooks/useLogout";
import { Breadcrumbs } from "./Breadcrumbs";

// «Ana Pérez» → «AP». Es decorativo: el nombre completo va al lado, como texto.
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Topbar() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-4 border-b bg-background px-4">
      <div className="flex min-w-0 items-center gap-6">
        <span className="font-display text-xl font-medium tracking-[-0.02em]">system-syc</span>
        <Breadcrumbs />
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {user && (
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-medium"
          >
            {initials(user.name)}
          </span>
        )}
        <span className="text-sm" data-testid="topbar-user">
          {user?.name}
        </span>
        <ChangePasswordDialog />
        <Button
          variant="outline"
          size="sm"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
        >
          Cerrar sesión
        </Button>
      </div>
    </header>
  );
}
