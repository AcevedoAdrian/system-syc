import { type CatalogRuta, catalogRutas } from "@syc/contracts";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getErrorMessage } from "@/lib/errors";
import { CATALOG_KINDS } from "../catalog-kinds";
import type { CatalogEntry } from "../hooks/catalog-api";
import { useCatalog } from "../hooks/useCatalog";
import { useCatalogMutations } from "../hooks/useCatalogMutations";
import { CatalogItemFormDialog } from "./CatalogItemFormDialog";
import { CatalogTable } from "./CatalogTable";

// Los campos de contacto de un proveedor no tienen formulario todavía: al editar el nombre se
// reenvían tal cual, porque `update` reemplaza todos los campos editables.
const CONTACT_FIELDS = ["contacto", "telefono", "correo", "sitioWeb"] as const;

function CatalogPanel({ ruta }: { ruta: CatalogRuta }) {
  const kind = CATALOG_KINDS[ruta];
  const { data: items, isPending, isError } = useCatalog(ruta);
  const { create, update, move, setActive, remove } = useCatalogMutations(ruta);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CatalogEntry | null>(null);
  const [removing, setRemoving] = useState<CatalogEntry | null>(null);
  const [actionError, setActionError] = useState<string>();

  const onError = useCallback((error: unknown) => setActionError(getErrorMessage(error)), []);

  const moveItem = useCallback(
    (item: CatalogEntry, direccion: "subir" | "bajar") => {
      setActionError(undefined);
      move.mutate({ itemId: item.id, direccion }, { onError });
    },
    [move, onError],
  );
  const toggleActive = useCallback(
    (item: CatalogEntry) => {
      setActionError(undefined);
      setActive.mutate({ itemId: item.id, activo: !item.activo }, { onError });
    },
    [setActive, onError],
  );
  const confirmRemove = () => {
    if (!removing) return;
    setActionError(undefined);
    remove.mutate({ itemId: removing.id }, { onError });
    setRemoving(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{kind.title}</h2>
        <Button onClick={() => setCreating(true)}>{kind.newLabel}</Button>
      </div>

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}
      {isPending && <p>{kind.loadingLabel}</p>}
      {isError && <p role="alert">{kind.loadErrorLabel}</p>}
      {items && (
        <CatalogTable
          items={items}
          onMove={moveItem}
          onEdit={setEditing}
          onToggleActive={toggleActive}
          onRemove={setRemoving}
        />
      )}

      <CatalogItemFormDialog
        open={creating}
        onOpenChange={setCreating}
        title={kind.newLabel}
        submitLabel="Crear"
        onSubmit={(values) => create.mutateAsync(values)}
      />
      <CatalogItemFormDialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={kind.editLabel}
        submitLabel="Guardar"
        initialName={editing?.nombre}
        onSubmit={(values) => {
          const contact = Object.fromEntries(
            CONTACT_FIELDS.filter((field) => editing && field in editing).map((field) => [
              field,
              editing?.[field] ?? null,
            ]),
          );
          return update.mutateAsync({ ...contact, ...values, itemId: editing?.id ?? "" });
        }}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Eliminar ${removing?.nombre ?? ""}`}
        description={`Se eliminará «${removing?.nombre}». No se puede deshacer desde la pantalla; si solo querés ocultarlo, desactivalo.`}
        confirmLabel="Eliminar"
        onConfirm={confirmRemove}
      />
    </div>
  );
}

interface CatalogsAdminProps {
  ruta: CatalogRuta;
  onRutaChange: (ruta: CatalogRuta) => void;
}

export function CatalogsAdmin({ ruta, onRutaChange }: CatalogsAdminProps) {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Catálogos</h1>
      <Tabs value={ruta} onValueChange={(value) => onRutaChange(value as CatalogRuta)}>
        <TabsList>
          {catalogRutas.map((item) => (
            <TabsTrigger key={item} value={item}>
              {CATALOG_KINDS[item].tab}
            </TabsTrigger>
          ))}
        </TabsList>
        {catalogRutas.map((item) => (
          <TabsContent key={item} value={item}>
            <CatalogPanel ruta={item} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
