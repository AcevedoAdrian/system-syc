import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";
import { Slot } from "radix-ui";
import type * as React from "react";

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2.5 py-0.5 text-[13px] font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground [a]:hover:bg-secondary/80",
        destructive:
          "bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20",
        outline: "border-border text-foreground [a]:hover:bg-muted [a]:hover:text-muted-foreground",
        ghost: "hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

// Los 8 tonos de insignia de la base visual (SPEC 09): son el vocabulario de color que el admin elige
// por estado y prioridad (SPEC 10). Cada uno trae fondo, texto y borde en `index.css`.
export const badgeTonos = [
  "gris",
  "rojo",
  "naranja",
  "amarillo",
  "verde",
  "azul",
  "violeta",
  "rosa",
] as const;
export type BadgeTono = (typeof badgeTonos)[number];

// Clases completas, no armadas con plantilla: Tailwind solo genera las que ve escritas.
const tonoClasses: Record<BadgeTono, string> = {
  gris: "border-tono-gris-border bg-tono-gris text-tono-gris-foreground",
  rojo: "border-tono-rojo-border bg-tono-rojo text-tono-rojo-foreground",
  naranja: "border-tono-naranja-border bg-tono-naranja text-tono-naranja-foreground",
  amarillo: "border-tono-amarillo-border bg-tono-amarillo text-tono-amarillo-foreground",
  verde: "border-tono-verde-border bg-tono-verde text-tono-verde-foreground",
  azul: "border-tono-azul-border bg-tono-azul text-tono-azul-foreground",
  violeta: "border-tono-violeta-border bg-tono-violeta text-tono-violeta-foreground",
  rosa: "border-tono-rosa-border bg-tono-rosa text-tono-rosa-foreground",
};

function Badge({
  className,
  variant = "default",
  tono,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { tono?: BadgeTono; asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      data-tono={tono}
      // `tono` pisa a `variant`: con un tono no se aplican los colores de ninguna variante.
      className={cn(
        badgeVariants({ variant: tono ? null : variant }),
        tono && tonoClasses[tono],
        className,
      )}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
