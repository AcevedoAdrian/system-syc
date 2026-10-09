import type { CatalogRuta } from "@syc/contracts";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCatalog } from "@/features/catalogs/hooks/useCatalog";
import { useOrganizations } from "@/features/organizations/hooks/useOrganizations";
import {
  hasActiveFilters,
  type TicketsFilterKey,
  type TicketsSearch,
  withFilter,
} from "../tickets-search";

// Pausa antes de buscar al escribir (SPEC 06): una consulta por pausa, no una por tecla.
export const SEARCH_DELAY_MS = 300;

export type FiltersChange = (next: TicketsSearch, options?: { replace?: boolean }) => void;

interface FilterOption {
  id: string;
  nombre: string;
  activo: boolean;
}

// Radix no admite un ítem con valor "": "Todos" viaja con este centinela y se traduce a sin filtro.
const ALL = "__all__";

// Los ítems activos primero y, al final, los inactivos marcados: un ticket histórico de un área
// desactivada se tiene que poder seguir encontrando. Cada grupo conserva su orden.
function activeFirst(options: FilterOption[]): FilterOption[] {
  return [...options.filter((o) => o.activo), ...options.filter((o) => !o.activo)];
}

function FilterSelect({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string;
  label: string;
  options: FilterOption[];
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? undefined : next)}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {activeFirst(options).map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.activo ? option.nombre : `${option.nombre} (inactivo)`}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Un selector de catálogo con todos sus ítems, activos e inactivos (`catalogs.<catálogo>.list`).
function CatalogFilter({
  ruta,
  filterKey,
  label,
  filters,
  onChange,
}: {
  ruta: CatalogRuta;
  filterKey: TicketsFilterKey;
  label: string;
  filters: TicketsSearch;
  onChange: FiltersChange;
}) {
  const { data: items = [] } = useCatalog(ruta);
  return (
    <FilterSelect
      id={`filtro-${filterKey}`}
      label={label}
      options={items}
      value={filters[filterKey] as string | undefined}
      onChange={(value) => onChange(withFilter(filters, filterKey, value))}
    />
  );
}

// Solo se monta para el admin: `organizations.list` es de administración y un agente ya está acotado a
// su departamento.
function DepartmentFilter({
  filters,
  onChange,
}: {
  filters: TicketsSearch;
  onChange: FiltersChange;
}) {
  const { data: departments = [] } = useOrganizations();
  return (
    <FilterSelect
      id="filtro-departamentoId"
      label="Departamento"
      options={departments}
      value={filters.departamentoId}
      onChange={(value) => onChange(withFilter(filters, "departamentoId", value))}
    />
  );
}

// El campo de búsqueda con estado propio: la URL se actualiza (con `replace`, sin llenar el historial)
// cuando el usuario deja de escribir. `sent` es lo último que se mandó a la URL: sirve para no pisar
// lo que se está escribiendo cuando la URL "vuelve", y para detectar un cambio externo ("Limpiar").
function SearchField({ filters, onChange }: { filters: TicketsSearch; onChange: FiltersChange }) {
  const [text, setText] = useState(filters.q ?? "");
  const sent = useRef(filters.q ?? "");
  const latest = useRef({ filters, onChange });
  latest.current = { filters, onChange };

  const urlText = filters.q ?? "";
  useEffect(() => {
    if (urlText !== sent.current) {
      sent.current = urlText;
      setText(urlText);
    }
  }, [urlText]);

  useEffect(() => {
    const next = text.trim();
    if (next === sent.current) return;
    const timer = setTimeout(() => {
      sent.current = next;
      const { filters: current, onChange: change } = latest.current;
      change(withFilter(current, "q", next), { replace: true });
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  return (
    <div className="flex min-w-60 flex-1 flex-col gap-1">
      <Label htmlFor="filtro-q">Buscar</Label>
      <Input
        id="filtro-q"
        type="search"
        value={text}
        name="q"
        autoComplete="off"
        maxLength={200}
        placeholder="Título, descripción, solución o comentarios…"
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  );
}

function DateFilter({
  id,
  label,
  filterKey,
  filters,
  onChange,
  min,
  max,
}: {
  id: string;
  label: string;
  filterKey: "fechaRecepcionDesde" | "fechaRecepcionHasta";
  filters: TicketsSearch;
  onChange: FiltersChange;
  min?: string;
  max?: string;
}) {
  return (
    <div className="flex min-w-40 flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={filters[filterKey] ?? ""}
        min={min}
        max={max}
        onChange={(event) => onChange(withFilter(filters, filterKey, event.target.value))}
      />
    </div>
  );
}

// Búsqueda y filtros de la bandeja. No guarda los filtros: los recibe de la URL y avisa cada cambio, que
// siempre vuelve a la página 1.
export function TicketsFilters({
  filters,
  onChange,
  isAdmin,
}: {
  filters: TicketsSearch;
  onChange: FiltersChange;
  isAdmin: boolean;
}) {
  const catalog = (ruta: CatalogRuta, filterKey: TicketsFilterKey, label: string) => (
    <CatalogFilter
      ruta={ruta}
      filterKey={filterKey}
      label={label}
      filters={filters}
      onChange={onChange}
    />
  );

  return (
    <search aria-label="Búsqueda y filtros" className="flex flex-wrap items-end gap-3">
      <SearchField filters={filters} onChange={onChange} />
      {catalog("estados", "estadoId", "Estado")}
      {catalog("areas", "areaId", "Área")}
      {catalog("edificios", "edificioId", "Edificio")}
      {catalog("tipos", "tipoId", "Tipo")}
      {catalog("prioridades", "prioridadId", "Prioridad")}
      {catalog("proveedores", "proveedorId", "Proveedor")}
      {catalog("modulos", "moduloId", "Módulo")}
      {isAdmin && <DepartmentFilter filters={filters} onChange={onChange} />}
      <DateFilter
        id="filtro-fechaRecepcionDesde"
        label="Recepción desde"
        filterKey="fechaRecepcionDesde"
        filters={filters}
        onChange={onChange}
        max={filters.fechaRecepcionHasta}
      />
      <DateFilter
        id="filtro-fechaRecepcionHasta"
        label="Recepción hasta"
        filterKey="fechaRecepcionHasta"
        filters={filters}
        onChange={onChange}
        min={filters.fechaRecepcionDesde}
      />
      {hasActiveFilters(filters) && (
        <Button type="button" variant="outline" onClick={() => onChange({})}>
          Limpiar filtros
        </Button>
      )}
    </search>
  );
}
