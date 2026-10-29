import type { CatalogRuta } from "@syc/contracts";
import { cn } from "cn";
import { Plus, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { listCardClass } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getErrorMessage } from "@/lib/errors";
import { CATALOG_KINDS } from "../catalog-kinds";
import { filterCatalog, paginate, type StatusFilter, statusCounts } from "../catalog-view";
import type { CatalogEntry } from "../hooks/catalog-api";
import { useCatalog } from "../hooks/useCatalog";
import { useCatalogMutations } from "../hooks/useCatalogMutations";
import { CatalogItemFormDialog } from "./CatalogItemFormDialog";
import { CatalogTable } from "./CatalogTable";
import { ModuloFormDialog } from "./ModuloFormDialog";
import { ProveedorFormDialog } from "./ProveedorFormDialog";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "todos", label: "Todos" },
  { value: "activos", label: "Activos" },
  { value: "desactivados", label: "Desactivados" },
];

const noticeClass = "border-t px-5 py-8 text-center text-muted-foreground";

function CatalogPanel({ ruta }: { ruta: CatalogRuta }) {
  const kind = CATALOG_KINDS[ruta];
  const { data: items, isPending, isError } = useCatalog(ruta);
  const { create, update, move, setActive, remove } = useCatalogMutations(ruta);

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<CatalogEntry | null>(null);
  const [removing, setRemoving] = useState<CatalogEntry | null>(null);
  const [actionError, setActionError] = useState<string>();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [requestedPage, setRequestedPage] = useState(1);

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

  const all = items ?? [];
  const filtering = search.trim() !== "" || status !== "todos";
  const filtered = filterCatalog(all, search, status);
  const view = paginate(filtered, requestedPage);
  const counts = statusCounts(all);

  return (
    <section className="mx-auto flex w-full max-w-300 flex-col gap-8">
      <PageHeader
        title={kind.title}
        description={kind.description}
        action={
          <Button className="h-10 px-5" onClick={() => setCreating(true)}>
            <Plus aria-hidden="true" />
            {kind.newLabel}
          </Button>
        }
      />

      {actionError && (
        <p role="alert" className="text-sm text-destructive">
          {actionError}
        </p>
      )}

      <section aria-label="Listado del catálogo" className={listCardClass}>
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="relative max-w-80 min-w-60 flex-[1_1_260px]">
            <Label htmlFor="catalogo-busqueda" className="sr-only">
              Buscar en el catálogo
            </Label>
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id="catalogo-busqueda"
              type="search"
              autoComplete="off"
              placeholder="Buscar por nombre"
              className="h-10 rounded-lg pr-3.5 pl-10 text-sm md:text-sm"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setRequestedPage(1);
              }}
            />
          </div>
          <fieldset className="m-0 flex min-w-0 flex-wrap gap-1 border-0 p-0">
            <legend className="sr-only">Filtrar por estado</legend>
            {STATUS_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                aria-pressed={status === filter.value}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  status === filter.value
                    ? "bg-card text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                onClick={() => {
                  setStatus(filter.value);
                  setRequestedPage(1);
                }}
              >
                {filter.label}{" "}
                <span className="font-normal text-muted-foreground tabular-nums">
                  {counts[filter.value]}
                </span>
              </button>
            ))}
          </fieldset>
        </div>

        {isPending && <p className={noticeClass}>{kind.loadingLabel}</p>}
        {isError && (
          <p role="alert" className={cn(noticeClass, "text-destructive")}>
            {kind.loadErrorLabel}
          </p>
        )}
        {items && items.length === 0 && <p className={noticeClass}>Todavía no hay registros.</p>}
        {items && items.length > 0 && filtered.length === 0 && (
          <p className={noticeClass}>No hay registros que coincidan con los filtros.</p>
        )}
        {view.rows.length > 0 && (
          <div className="border-t">
            <CatalogTable
              ruta={ruta}
              items={view.rows}
              orderIds={all.map((item) => item.id)}
              canReorder={!filtering}
              onMove={moveItem}
              onEdit={setEditing}
              onToggleActive={toggleActive}
              onRemove={setRemoving}
            />
          </div>
        )}
        {view.total > 0 && (
          <nav
            aria-label="Paginación"
            className="flex flex-wrap items-center justify-between gap-3 border-t px-5 py-3 text-sm text-muted-foreground"
          >
            <p className="tabular-nums">
              Mostrando {view.from}–{view.to} de {view.total} · Página {view.page} de {view.pages}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 px-5"
                disabled={view.page <= 1}
                onClick={() => setRequestedPage(view.page - 1)}
              >
                Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 px-5"
                disabled={view.page >= view.pages}
                onClick={() => setRequestedPage(view.page + 1)}
              >
                Siguiente
              </Button>
            </div>
          </nav>
        )}
      </section>

      {ruta === "modulos" ? (
        <>
          <ModuloFormDialog
            open={creating}
            onOpenChange={setCreating}
            title={kind.newLabel}
            submitLabel="Crear"
            onSubmit={(values) => create.mutateAsync(values)}
          />
          <ModuloFormDialog
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            title={kind.editLabel}
            submitLabel="Guardar"
            initial={editing}
            onSubmit={(values) => update.mutateAsync({ ...values, itemId: editing?.id ?? "" })}
          />
        </>
      ) : ruta === "proveedores" ? (
        <>
          <ProveedorFormDialog
            open={creating}
            onOpenChange={setCreating}
            title={kind.newLabel}
            submitLabel="Crear"
            onSubmit={(values) => create.mutateAsync(values)}
          />
          <ProveedorFormDialog
            open={editing !== null}
            onOpenChange={(open) => !open && setEditing(null)}
            title={kind.editLabel}
            submitLabel="Guardar"
            initial={editing}
            onSubmit={(values) => update.mutateAsync({ ...values, itemId: editing?.id ?? "" })}
          />
        </>
      ) : (
        <>
          <CatalogItemFormDialog
            ruta={ruta}
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
            ruta={ruta}
            initialName={editing?.nombre}
            initialTipoId={editing?.tipo?.id}
            onSubmit={(values) => update.mutateAsync({ ...values, itemId: editing?.id ?? "" })}
          />
        </>
      )}
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Eliminar ${removing?.nombre ?? ""}`}
        description={`Se eliminará «${removing?.nombre}». No se puede deshacer desde la pantalla; si solo querés ocultarlo, desactivalo.`}
        confirmLabel="Eliminar"
        destructive
        onConfirm={confirmRemove}
      />
    </section>
  );
}

// El catálogo que se administra lo elige el menú lateral (`?catalogo=`). Al cambiar de catálogo la
// pantalla se vuelve a montar (`key`) y se reinician la búsqueda, el filtro y la página.
export function CatalogsAdmin({ ruta }: { ruta: CatalogRuta }) {
  return <CatalogPanel key={ruta} ruta={ruta} />;
}
