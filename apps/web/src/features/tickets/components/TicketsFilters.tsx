import { areaLabel, type CatalogRuta } from "@syc/contracts";
import { cn } from "cn";
import { ListFilter, Search } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { type SearchableOption, SearchableSelect } from "@/components/common/SearchableSelect";
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
import { groupAreasByTipo } from "@/features/catalogs/area-groups";
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

// Los filtros que viven bajo «Más filtros». Si la URL trae alguno, el panel arranca abierto.
const MORE_FILTER_KEYS = [
  "areaId",
  "tipoAreaId",
  "edificioId",
  "tipoId",
  "proveedorId",
  "moduloId",
  "fechaRecepcionDesde",
  "fechaRecepcionHasta",
] as const satisfies readonly TicketsFilterKey[];

const MORE_PANEL_ID = "filtros-adicionales";

// Los ítems activos primero y, al final, los inactivos marcados: un ticket histórico de un área
// desactivada se tiene que poder seguir encontrando. Cada grupo conserva su orden.
function activeFirst<T extends { activo: boolean }>(options: T[]): T[] {
  return [...options.filter((o) => o.activo), ...options.filter((o) => !o.activo)];
}

// El ítem de una opción, con los inactivos marcados.
function OptionItem({ option }: { option: FilterOption }) {
  return (
    <SelectItem value={option.id}>
      {option.activo ? option.nombre : `${option.nombre} (inactivo)`}
    </SelectItem>
  );
}

// `inline`: la etiqueta va a la izquierda del selector (fila principal). Sin `inline`, arriba (panel de
// «Más filtros»). `children` son las opciones que siguen a «Todos». `selectedLabel` es lo que muestra el
// botón con un valor elegido, cuando no es el texto de la opción (el área, como «Tipo · Nombre»).
function FilterSelect({
  id,
  label,
  value,
  onChange,
  inline,
  selectedLabel,
  children,
}: {
  id: string;
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  inline?: boolean;
  selectedLabel?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 gap-2", inline ? "items-center" : "flex-col gap-1.5")}>
      <Label
        htmlFor={id}
        className={inline ? "text-sm font-normal text-muted-foreground" : "text-[13px]"}
      >
        {label}
      </Label>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? undefined : next)}
      >
        <SelectTrigger
          id={id}
          className={cn("data-[size=default]:h-10", inline ? "min-w-36" : "w-full")}
        >
          <SelectValue>{value === undefined ? undefined : selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {children}
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
  inline,
}: {
  ruta: CatalogRuta;
  filterKey: TicketsFilterKey;
  label: string;
  filters: TicketsSearch;
  onChange: FiltersChange;
  inline?: boolean;
}) {
  const { data: items = [] } = useCatalog(ruta);
  return (
    <FilterSelect
      id={`filtro-${filterKey}`}
      label={label}
      value={filters[filterKey] as string | undefined}
      onChange={(value) => onChange(withFilter(filters, filterKey, value))}
      inline={inline}
    >
      {activeFirst(items).map((option) => (
        <OptionItem key={option.id} option={option} />
      ))}
    </FilterSelect>
  );
}

// El filtro de área, agrupado por tipo como el selector del formulario (SPEC 09, 9.7). Ofrece las áreas
// activas e inactivas: dentro de cada grupo, las inactivas al final. Las de un tipo que no se conoce (o
// mientras Tipos de área carga) van al final, sin grupo. Como la lista es larga, el desplegable trae un
// buscador que, desde 3 caracteres, recorta por tipo y nombre.
function AreaFilter({ filters, onChange }: { filters: TicketsSearch; onChange: FiltersChange }) {
  const { data: areas = [] } = useCatalog("areas");
  const { data: tipos = [] } = useCatalog("tiposArea");
  const { groups, rest } = groupAreasByTipo(areas, tipos);
  const selected = areas.find((area) => area.id === filters.areaId);
  const name = selected?.tipo
    ? areaLabel({ nombre: selected.nombre, tipo: selected.tipo })
    : selected?.nombre;
  const selectedLabel = selected && !selected.activo ? `${name} (inactivo)` : name;
  const toOption = (area: (typeof areas)[number]): SearchableOption => ({
    value: area.id,
    label: area.activo ? area.nombre : `${area.nombre} (inactivo)`,
    searchText: `${area.tipo?.nombre ?? ""} ${area.nombre}`,
  });

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor="filtro-areaId" className="text-[13px]">
        Área
      </Label>
      <SearchableSelect
        id="filtro-areaId"
        value={filters.areaId ?? ""}
        onChange={(value) => onChange(withFilter(filters, "areaId", value || undefined))}
        searchLabel="Buscar área"
        selectedLabel={filters.areaId === undefined ? undefined : selectedLabel}
        leadingOptions={[{ value: "", label: "Todos" }]}
        groups={groups.map(({ tipo, areas: grouped }) => ({
          id: tipo.id,
          label: tipo.nombre,
          options: activeFirst(grouped).map(toOption),
        }))}
        rest={activeFirst(rest).map(toOption)}
        triggerClassName="w-full data-[size=default]:h-10"
      />
    </div>
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
      value={filters.departamentoId}
      onChange={(value) => onChange(withFilter(filters, "departamentoId", value))}
      inline
    >
      {activeFirst(departments).map((option) => (
        <OptionItem key={option.id} option={option} />
      ))}
    </FilterSelect>
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
    <div className="relative max-w-75 min-w-60 flex-[1_1_240px]">
      <Label htmlFor="filtro-q" className="sr-only">
        Buscar
      </Label>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-4.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        id="filtro-q"
        type="search"
        value={text}
        name="q"
        autoComplete="off"
        maxLength={200}
        placeholder="Título, texto o comentarios…"
        className="h-10 rounded-lg pr-3.5 pl-10 text-sm md:text-sm"
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
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px]">
        {label}
      </Label>
      <Input
        id={id}
        type="date"
        className="h-10 rounded-lg"
        value={filters[filterKey] ?? ""}
        min={min}
        max={max}
        onChange={(event) => onChange(withFilter(filters, filterKey, event.target.value))}
      />
    </div>
  );
}

// Búsqueda y filtros de la bandeja. No guarda los filtros: los recibe de la URL y avisa cada cambio, que
// siempre vuelve a la página 1. Lo único que guarda es si «Más filtros» está abierto.
export function TicketsFilters({
  filters,
  onChange,
  isAdmin,
}: {
  filters: TicketsSearch;
  onChange: FiltersChange;
  isAdmin: boolean;
}) {
  const moreActive = MORE_FILTER_KEYS.filter((key) => filters[key] !== undefined).length;
  // Abierto desde el principio si la URL trae un filtro de los de adentro; y se abre solo si después
  // llega uno (por ejemplo, desde un enlace): un filtro activo no puede quedar escondido.
  const [moreOpen, setMoreOpen] = useState(moreActive > 0);
  useEffect(() => {
    if (moreActive > 0) setMoreOpen(true);
  }, [moreActive]);

  const catalog = (
    ruta: CatalogRuta,
    filterKey: TicketsFilterKey,
    label: string,
    inline?: boolean,
  ) => (
    <CatalogFilter
      ruta={ruta}
      filterKey={filterKey}
      label={label}
      filters={filters}
      onChange={onChange}
      inline={inline}
    />
  );

  return (
    <search aria-label="Búsqueda y filtros">
      <div className="flex flex-wrap items-center gap-3 px-5 py-4">
        <SearchField filters={filters} onChange={onChange} />
        {catalog("estados", "estadoId", "Estado", true)}
        {catalog("prioridades", "prioridadId", "Prioridad", true)}
        {isAdmin && <DepartmentFilter filters={filters} onChange={onChange} />}
        <Button
          type="button"
          variant="outline"
          className="h-10 gap-2 px-3.5"
          aria-expanded={moreOpen}
          aria-controls={MORE_PANEL_ID}
          onClick={() => setMoreOpen((open) => !open)}
        >
          <ListFilter aria-hidden="true" />
          Más filtros{moreActive > 0 && ` (${moreActive})`}
        </Button>
        {hasActiveFilters(filters) && (
          <Button
            type="button"
            variant="ghost"
            className="h-10 px-1 text-foreground underline hover:bg-transparent"
            onClick={() => onChange({})}
          >
            Limpiar filtros
          </Button>
        )}
      </div>
      {moreOpen && (
        <div
          id={MORE_PANEL_ID}
          className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-4 px-5 pt-1 pb-5"
        >
          <AreaFilter filters={filters} onChange={onChange} />
          {catalog("tiposArea", "tipoAreaId", "Tipo de área")}
          {catalog("edificios", "edificioId", "Edificio")}
          {catalog("tipos", "tipoId", "Tipo de ticket")}
          {catalog("proveedores", "proveedorId", "Proveedor")}
          {catalog("modulos", "moduloId", "Módulo")}
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
        </div>
      )}
    </search>
  );
}
