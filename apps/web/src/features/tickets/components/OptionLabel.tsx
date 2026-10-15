import type { Tono } from "@syc/contracts";
import { Badge } from "@/components/ui/badge";

// El contenido de una opción de un desplegable de catálogo (SPEC 10). Si el ítem trae `color`
// (estados y prioridades) se ve como insignia con su nombre; si no, como texto. La marca
// «(inactivo)» va siempre fuera de la insignia. El nombre accesible sigue siendo el del ítem: la
// insignia es solo el texto con color.
export function OptionLabel({
  nombre,
  color,
  inactive = false,
}: {
  nombre: string;
  color?: Tono | undefined;
  inactive?: boolean;
}) {
  const label = color ? <Badge tono={color}>{nombre}</Badge> : nombre;
  return inactive ? <>{label} (inactivo)</> : label;
}
