import type { User } from "@syc/contracts";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { listCardClass } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { useOrganizations } from "@/features/organizations/hooks/useOrganizations";
import { getErrorMessage } from "@/lib/errors";
import {
  useCreateUser,
  useResetUserPassword,
  useSetUserActive,
  useUpdateUser,
} from "../hooks/useUserMutations";
import { useUsers } from "../hooks/useUsers";
import { CreateUserDialog } from "./CreateUserDialog";
import { EditUserDialog } from "./EditUserDialog";
import { ResetPasswordDialog } from "./ResetPasswordDialog";
import { UsersTable } from "./UsersTable";

export function UsersAdmin() {
  const { data: users, isPending, isError } = useUsers();
  const { data: departments = [] } = useOrganizations();
  const { data: me } = useCurrentUser();
  const create = useCreateUser();
  const update = useUpdateUser();
  const setActive = useSetUserActive();
  const resetPassword = useResetUserPassword();

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [resetting, setResetting] = useState<User | null>(null);
  const [actionError, setActionError] = useState<string>();

  const toggleActive = useCallback(
    (user: User) => {
      setActionError(undefined);
      setActive.mutate(
        { userId: user.id, activo: !user.activo },
        { onError: (error) => setActionError(getErrorMessage(error)) },
      );
    },
    [setActive],
  );

  return (
    <section className="mx-auto flex w-full max-w-300 flex-col gap-8">
      <PageHeader
        title="Usuarios"
        description="Cuentas de acceso. Los agentes pertenecen a un departamento; los administradores ven todo."
        action={
          <Button className="h-10 px-5" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            Nuevo usuario
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      <section aria-label="Listado de usuarios" className={listCardClass}>
        {isPending && <p className="px-5 py-8 text-muted-foreground">Cargando usuarios…</p>}
        {isError && (
          <p role="alert" className="px-5 py-8 text-destructive">
            No se pudieron cargar los usuarios.
          </p>
        )}
        {users && (
          <UsersTable
            users={users}
            currentUserId={me?.id}
            onEdit={setEditing}
            onToggleActive={toggleActive}
            onResetPassword={setResetting}
          />
        )}
      </section>

      <CreateUserDialog
        open={creating}
        onOpenChange={setCreating}
        departments={departments}
        onSubmit={(values) => create.mutateAsync(values)}
      />
      <EditUserDialog
        user={editing}
        onOpenChange={(open) => !open && setEditing(null)}
        departments={departments}
        onSubmit={(values) => update.mutateAsync(values)}
      />
      <ResetPasswordDialog
        user={resetting}
        onOpenChange={(open) => !open && setResetting(null)}
        onSubmit={(values) => resetPassword.mutateAsync(values)}
      />
    </section>
  );
}
