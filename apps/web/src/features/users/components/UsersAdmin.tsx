import type { User } from "@syc/contracts";
import { useCallback, useState } from "react";
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <Button onClick={() => setCreating(true)}>Nuevo usuario</Button>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      {isPending && <p>Cargando usuarios…</p>}
      {isError && <p role="alert">No se pudieron cargar los usuarios.</p>}
      {users && (
        <UsersTable
          users={users}
          currentUserId={me?.id}
          onEdit={setEditing}
          onToggleActive={toggleActive}
          onResetPassword={setResetting}
        />
      )}

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
    </div>
  );
}
