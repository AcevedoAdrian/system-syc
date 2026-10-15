import { areaLabel, type CatalogRuta, type Tono } from "@syc/contracts";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCatalog } from "@/features/catalogs/hooks/useCatalog";
import { useCatalogOptions } from "@/features/catalogs/hooks/useCatalogOptions";
import type { FieldControlProps } from "./Field";
import { OptionLabel } from "./OptionLabel";

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
  // Un área trae además su tipo, para mostrarse como «Tipo · Nombre»; una prioridad, su color (SPEC 10).
  current?: {
    id: string;
    nombre: string;
    tipo?: { id: string; nombre: string };
    color?: Tono;
  } | null;
  // Un ítem que no se ofrece (el estado actual al cambiar de estado).
  excludeId?: string;
  disabled?: boolean;
}

// Los selectores de catálogo de los formularios de ticket: ofrece solo los ítems activos
// (`useCatalogOptions`), en el orden de la administración. Las áreas van agrupadas por tipo.
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
  disabled,
  ...aria
}: CatalogOptionSelectProps) {
  const { data: allOptions = [], isPending } = useCatalogOptions(ruta);
  const options = allOptions.filter((option) => option.id !== excludeId);
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
      <SelectTrigger id={id} className="w-full" {...aria}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            <OptionLabel nombre={option.nombre} color={option.color} />
          </SelectItem>
        ))}
        {isPending && current && (
          <SelectItem value={current.id}>
            <OptionLabel nombre={current.nombre} color={current.color} />
          </SelectItem>
        )}
        {currentIsOutOfOptions && (
          <SelectItem value={current.id}>
            <OptionLabel nombre={current.nombre} color={current.color} inactive />
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}

// SPEC 08: las áreas se agrupan bajo un título por tipo. Los grupos siguen el orden del catálogo
// Tipos de área (activos e inactivos: desactivar un tipo no saca a sus áreas del selector), las áreas
// de cada grupo el de Áreas, y un grupo sin áreas activas no se muestra. El botón muestra el valor
// elegido como «Tipo · Nombre».
function AreaOptionSelect({
  id,
  value,
  onChange,
  placeholder = "Elegí una opción",
  emptyLabel,
  current,
  excludeId,
  disabled,
  ruta: _ruta,
  ...aria
}: CatalogOptionSelectProps) {
  const { data: allOptions = [], isPending } = useCatalogOptions("areas");
  const { data: tipos = [] } = useCatalog("tiposArea");
  const options = allOptions.filter((option) => option.id !== excludeId);

  const groups = tipos
    .map((tipo) => ({
      tipo,
      areas: options.filter((option) => option.tipo?.id === tipo.id),
    }))
    .filter((group) => group.areas.length > 0);

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

  return (
    <Select
      value={value === "" && emptyLabel ? NONE : value}
      onValueChange={(next) => onChange(next === NONE ? "" : next)}
      disabled={disabled}
    >
      <SelectTrigger id={id} className="w-full" {...aria}>
        <SelectValue placeholder={placeholder}>
          {value === "" ? undefined : selectedLabel}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
        {groups.map(({ tipo, areas }) => (
          <SelectGroup key={tipo.id}>
            <SelectLabel>{tipo.nombre}</SelectLabel>
            {areas.map((area) => (
              <SelectItem key={area.id} value={area.id}>
                {area.nombre}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
        {isPending && current && <SelectItem value={current.id}>{current.nombre}</SelectItem>}
        {currentIsOutOfOptions && (
          <SelectItem value={current.id}>{labelOf(current)} (inactivo)</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
