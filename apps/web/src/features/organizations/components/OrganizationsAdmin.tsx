import type { Organization } from "@syc/contracts";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import {
  useCreateOrganization,
  useRemoveOrganization,
  useRenameOrganization,
  useSetOrganizationActive,
} from "../hooks/useOrganizationMutations";
import { useOrganizations } from "../hooks/useOrganizations";
import { OrganizationFormDialog } from "./OrganizationFormDialog";
import { OrganizationsTable } from "./OrganizationsTable";

export function OrganizationsAdmin() {
  const { data: organizations, isPending, isError } = useOrganizations();
  const create = useCreateOrganization();
  const rename = useRenameOrganization();
  const setActive = useSetOrganizationActive();
  const remove = useRemoveOrganization();

  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<Organization | null>(null);
  const [removing, setRemoving] = useState<Organization | null>(null);
  const [actionError, setActionError] = useState<string>();

  const toggleActive = useCallback(
    (organization: Organization) => {
      setActionError(undefined);
      setActive.mutate(
        { organizationId: organization.id, activo: !organization.activo },
        { onError: (error) => setActionError(getErrorMessage(error)) },
      );
    },
    [setActive],
  );
  const confirmRemove = () => {
    if (!removing) return;
    setActionError(undefined);
    remove.mutate(
      { organizationId: removing.id },
      { onError: (error) => setActionError(getErrorMessage(error)) },
    );
    setRemoving(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Departamentos</h1>
        <Button onClick={() => setCreating(true)}>Nuevo departamento</Button>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      {isPending && <p>Cargando departamentos…</p>}
      {isError && <p role="alert">No se pudieron cargar los departamentos.</p>}
      {organizations && (
        <OrganizationsTable
          organizations={organizations}
          onRename={setRenaming}
          onToggleActive={toggleActive}
          onRemove={setRemoving}
        />
      )}

      <OrganizationFormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nuevo departamento"
        submitLabel="Crear"
        onSubmit={(values) => create.mutateAsync(values)}
      />
      <OrganizationFormDialog
        open={renaming !== null}
        onOpenChange={(open) => !open && setRenaming(null)}
        title="Renombrar departamento"
        submitLabel="Guardar"
        initialName={renaming?.nombre}
        onSubmit={(values) =>
          rename.mutateAsync({ organizationId: renaming?.id ?? "", nombre: values.nombre })
        }
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Eliminar departamento"
        description={`Se eliminará "${removing?.nombre}" de forma definitiva. Solo se puede si no tiene agentes asignados.`}
        confirmLabel="Eliminar"
        onConfirm={confirmRemove}
      />
    </div>
  );
}
