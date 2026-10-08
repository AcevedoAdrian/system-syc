import type { CatalogRuta } from "@syc/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCatalogOptions } from "@/features/catalogs/hooks/useCatalogOptions";
import type { FieldControlProps } from "./Field";

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
  current?: { id: string; nombre: string } | null;
  // Un ítem que no se ofrece (el estado actual al cambiar de estado).
  excludeId?: string;
  disabled?: boolean;
}

// Los selectores de catálogo de los formularios de ticket: ofrece solo los ítems activos
// (`useCatalogOptions`), en el orden de la administración.
export function CatalogOptionSelect({
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
  const { data: allOptions = [] } = useCatalogOptions(ruta);
  const options = allOptions.filter((option) => option.id !== excludeId);
  const currentIsOutOfOptions = current && !options.some((option) => option.id === current.id);

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
            {option.nombre}
          </SelectItem>
        ))}
        {currentIsOutOfOptions && (
          <SelectItem value={current.id}>{current.nombre} (inactivo)</SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
