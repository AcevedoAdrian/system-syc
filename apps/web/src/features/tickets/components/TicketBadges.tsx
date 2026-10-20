import { cn } from "cn";
import { useCatalog } from "@/features/catalogs/hooks/useCatalog";
import { estadoDotClass, prioridadDotClass } from "../ticket-colors";

// El estado como píldora con su punto de color. El color se deriva de los catálogos (SPEC 09, 9.4);
// el nombre siempre va escrito, así que el color nunca es la única señal.
export function EstadoPill({
  estado,
}: {
  estado: { id: string; nombre: string; clave: string | null };
}) {
  const { data: estados } = useCatalog("estados");

  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-[13px] leading-snug font-medium text-foreground">
      <span
        aria-hidden="true"
        className={cn("size-2.5 shrink-0 rounded-full", estadoDotClass(estado, estados))}
      />
      {estado.nombre}
    </span>
  );
}

export function PrioridadLabel({ prioridad }: { prioridad: { id: string; nombre: string } }) {
  const { data: prioridades } = useCatalog("prioridades");

  return (
    <span className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={cn("size-2 shrink-0 rounded-full", prioridadDotClass(prioridad.id, prioridades))}
      />
      {prioridad.nombre}
    </span>
  );
}

// El punto de la prioridad para el selector de los formularios. Sin prioridad elegida, un aro discontinuo.
export function PrioridadDot({ id }: { id: string }) {
  const { data: prioridades } = useCatalog("prioridades");

  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2.5 shrink-0 rounded-full",
        id
          ? prioridadDotClass(id, prioridades)
          : "border-2 border-dashed border-muted-foreground bg-transparent",
      )}
    />
  );
}

// El punto del estado para el campo de solo lectura del formulario de edición.
export function EstadoDot({ estado }: { estado: { id: string; clave: string | null } }) {
  const { data: estados } = useCatalog("estados");

  return (
    <span
      aria-hidden="true"
      className={cn("size-2.5 shrink-0 rounded-full", estadoDotClass(estado, estados))}
    />
  );
}
