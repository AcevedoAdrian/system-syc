import { Button } from "@/components/ui/button";
import { ChangePasswordDialog } from "@/features/auth/components/ChangePasswordDialog";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useLogout } from "@/features/auth/hooks/useLogout";

export function Topbar() {
  const { data: user } = useCurrentUser();
  const logout = useLogout();

  return (
    <header className="flex h-12 items-center justify-between border-b px-4">
      <span className="font-semibold">system-syc</span>
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground" data-testid="topbar-user">
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
