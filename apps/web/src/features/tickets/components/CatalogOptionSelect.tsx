import { areaLabel, type CatalogRuta } from "@syc/contracts";
import { cn } from "cn";
import type { ReactNode } from "react";
import { type FieldControlProps, selectClass } from "@/components/common/Field";
import { type SearchableOption, SearchableSelect } from "@/components/common/SearchableSelect";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { groupAreasByTipo } from "@/features/catalogs/area-groups";
import { useCatalog } from "@/features/catalogs/hooks/useCatalog";
import { useCatalogOptions } from "@/features/catalogs/hooks/useCatalogOptions";

// Con un punto delante, el valor queda pegado a él y la flecha se va a la derecha (sin esto, `justify-between`
// reparte los tres y centra el valor).
const leadingClass = "justify-start gap-2.5 [&>svg:last-child]:ml-auto";

// Radix no admite un ítem con valor "": el "sin valor" viaja con este centinela y se traduce a "".
const NONE = "__none__";

// Los atributos `aria-*` son los que entrega `Field`: van al botón del selector.
interface CatalogOptionSelectProps extends FieldControlProps {
  id: string;
  ruta: CatalogRuta;
  // Id elegido, o "" si no hay.
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  // Ofrece "sin valor" como primera opción (los campos opcionales del ticket).
  emptyLabel?: string;
  // El valor que el ticket ya tiene. Si hoy está desactivado o eliminado no está en las opciones, pero
  // se sigue mostrando (marcado) para que guardar sin tocarlo no lo borre (SPEC 05, "referencia válida").
  // Un área trae además su tipo, para mostrarse como «Tipo · Nombre».
  current?: { id: string; nombre: string; tipo?: { id: string; nombre: string } } | null;
  // Un ítem que no se ofrece (el estado actual al cambiar de estado).
  excludeId?: string;
  // El departamento del ticket. Solo lo usa `modulos` (SPEC 11): ofrece los módulos activos que lo
  // tienen, y el actual que no está entre ellos se marca «(no disponible)». Sin departamento no hay
  // opciones.
  departamentoId?: string;
  disabled?: boolean;
  // Algo que va dentro del botón, antes del valor (el punto de color de la prioridad).
  leading?: ReactNode;
}

// Los selectores de catálogo de los formularios de ticket: ofrece solo los ítems activos
// (`useCatalogOptions`), en el orden de la administración. Las áreas van agrupadas por tipo y los
// módulos se acotan al departamento del ticket.
export function CatalogOptionSelect(props: CatalogOptionSelectProps) {
  return props.ruta === "areas" ? <AreaOptionSelect {...props} /> : <FlatOptionSelect {...props} />;
}

function FlatOptionSelect({
  id,
  ruta,
  value,
  onChange,
  placeholder = "Elegí una opción",
  emptyLabel,
  current,
  excludeId,
  departamentoId,
  disabled,
  leading,
  ...aria
}: CatalogOptionSelectProps) {
  const { data: allOptions = [], isPending } = useCatalogOptions(ruta);
  // El recorte por permisos ya lo hizo la API: esto es para el admin, que recibe todos los módulos y
  // trabaja tickets de cualquier departamento.
  const scoped = ruta === "modulos";
  const options = allOptions.filter(
    (option) =>
      option.id !== excludeId &&
      (!scoped || option.departamentos?.some((dep) => dep.id === departamentoId)),
  );
  const outOfOptionsMark = scoped ? "no disponible" : "inactivo";
  // Hasta que llega el catálogo no se sabe si el valor actual sigue activo: se muestra sin marca, en vez de
  // parpadear con «(inactivo)» y corregirse después.
  const currentIsOutOfOptions =
    !isPending && current && !options.some((option) => option.id === current.id);

  return (
    <Select
      value={value === "" && emptyLabel ? NONE : value}
      onValueChange={(next) => onChange(next === NONE ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className={cn(selectClass, leading && leadingClass)} {...aria}>
        {leading}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.nombre}
          </SelectItem>
        ))}
        {isPending && current && <SelectItem value={current.id}>{current.nombre}</SelectItem>}
        {currentIsOutOfOptions && (
          <SelectItem value={current.id}>
            {current.nombre} ({outOfOptionsMark})
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

// SPEC 08: las áreas se agrupan bajo un título por tipo. Los grupos siguen el orden del catálogo
// Tipos de área (activos e inactivos: desactivar un tipo no saca a sus áreas del selector), las áreas
// de cada grupo el de Áreas, y un grupo sin áreas activas no se muestra. El botón muestra el valor
// elegido como «Tipo · Nombre». La lista es larga: el desplegable trae un buscador que, desde 3
// caracteres, recorta por tipo y nombre.
function AreaOptionSelect({
  id,
  value,
  onChange,
  placeholder = "Elegí una opción",
  emptyLabel,
  current,
  excludeId,
  disabled,
  leading,
  ruta: _ruta,
  ...aria
}: CatalogOptionSelectProps) {
  const { data: allOptions = [], isPending } = useCatalogOptions("areas");
  const { data: tipos = [] } = useCatalog("tiposArea");
  const options = allOptions.filter((option) => option.id !== excludeId);

  const { groups, rest } = groupAreasByTipo(options, tipos);

  const currentIsOutOfOptions =
    !isPending && current && !options.some((option) => option.id === current.id);
  const labelOf = (area: NonNullable<typeof current>) =>
    area.tipo ? areaLabel({ nombre: area.nombre, tipo: area.tipo }) : area.nombre;
  const selected = options.find((option) => option.id === value);
  const inactiveCurrent = currentIsOutOfOptions && current?.id === value ? current : null;
  // El botón muestra «Tipo · Nombre»; un área actual desactivada, además, marcada.
  const selectedLabel = selected
    ? labelOf(selected)
    : inactiveCurrent
      ? `${labelOf(inactiveCurrent)} (inactivo)`
      : current?.id === value
        ? labelOf(current)
        : undefined;

  // Las áreas de un tipo que no se conoce (o mientras Tipos de área carga) van al final, sin grupo, junto
  // al valor actual que no está entre las opciones.
  const loose: SearchableOption[] = [
    ...rest.map((area) => ({
      value: area.id,
      label: area.nombre,
      searchText: `${area.tipo?.nombre ?? ""} ${area.nombre}`,
    })),
    ...(isPending && current ? [{ value: current.id, label: current.nombre }] : []),
    ...(currentIsOutOfOptions
      ? [{ value: current.id, label: `${labelOf(current)} (inactivo)` }]
      : []),
  ];

  return (
    <SearchableSelect
      id={id}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      searchLabel="Buscar área"
      selectedLabel={value === "" ? undefined : selectedLabel}
      leadingOptions={emptyLabel ? [{ value: "", label: emptyLabel }] : []}
      groups={groups.map(({ tipo, areas }) => ({
        id: tipo.id,
        label: tipo.nombre,
        options: areas.map((area) => ({
          value: area.id,
          label: area.nombre,
          searchText: `${tipo.nombre} ${area.nombre}`,
        })),
      }))}
      rest={loose}
      disabled={disabled}
      leading={leading}
      triggerClassName={cn(selectClass, leading && leadingClass)}
      {...aria}
    />
  );
}
