import { cn } from "cn";

// «Activo» o «Desactivado» como píldora con su punto: lleno y verde azulado si está activo, un aro gris
// si no. El texto siempre acompaña al punto.
export function ActivePill({ active }: { active: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-card px-3 py-1 text-[13px] leading-snug font-medium text-foreground">
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          active ? "bg-teal" : "border-2 border-neutral-dot bg-transparent",
        )}
      />
      {active ? "Activo" : "Desactivado"}
    </span>
  );
}
