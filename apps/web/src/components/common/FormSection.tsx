import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// El color de cada sección es un token (`--teal`, `--amber`…): la clase `tone-*` de index.css lo deja en
// `--sc`, de donde lo toman la franja, el fondo, el borde y los íconos de las etiquetas.
const TONES = {
  brand: "tone-brand",
  amber: "tone-amber",
  violet: "tone-violet",
  teal: "tone-teal",
  blue: "tone-blue",
} as const;

export type SectionTone = keyof typeof TONES;

interface FormSectionProps {
  // Une el título con la región: `aria-labelledby`.
  id: string;
  tone: SectionTone;
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
}

// Una tarjeta del formulario o del detalle del ticket (SPEC 09, etapa 9.5): ícono, título y descripción
// arriba, y el contenido debajo.
export function FormSection({
  id,
  tone,
  icon: Icon,
  title,
  description,
  className,
  children,
}: FormSectionProps) {
  return (
    <section aria-labelledby={id} className={cn("form-section", TONES[tone], className)}>
      <div className="flex items-center gap-3.5">
        <span className="form-section-icon" aria-hidden="true">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id={id} className="text-lg leading-snug font-medium text-foreground">
            {title}
          </h2>
          <p className="mt-0.5 text-muted-foreground">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}
