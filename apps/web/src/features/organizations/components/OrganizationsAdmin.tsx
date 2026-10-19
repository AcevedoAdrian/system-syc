import type { Organization } from "@syc/contracts";
import { Plus } from "lucide-react";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { listCardClass } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/PageHeader";
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
    <section className="mx-auto flex w-full max-w-300 flex-col gap-8">
      <PageHeader
        title="Departamentos"
        description="Equipos que atienden los tickets. Solo administradores."
        action={
          <Button className="h-10 px-5" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            Nuevo departamento
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      <section aria-label="Listado de departamentos" className={listCardClass}>
        {isPending && <p className="px-5 py-8 text-muted-foreground">Cargando departamentos…</p>}
        {isError && (
          <p role="alert" className="px-5 py-8 text-destructive">
            No se pudieron cargar los departamentos.
          </p>
        )}
        {organizations && organizations.length === 0 && (
          <p className="px-5 py-8 text-muted-foreground">Todavía no hay departamentos.</p>
        )}
        {organizations && organizations.length > 0 && (
          <OrganizationsTable
            organizations={organizations}
            onRename={setRenaming}
            onToggleActive={toggleActive}
            onRemove={setRemoving}
          />
        )}
      </section>

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
        destructive
        onConfirm={confirmRemove}
      />
    </section>
  );
}
