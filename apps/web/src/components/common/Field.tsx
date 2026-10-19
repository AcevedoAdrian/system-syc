import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

// Medidas de los controles de los formularios de ticket (maqueta): 40px de alto y texto de 16px.
export const controlClass = "h-10 rounded-lg px-3.5 text-base md:text-base";
export const textareaClass =
  "min-h-26 rounded-lg px-3.5 py-2.5 text-base leading-relaxed md:text-base";
// El texto del selector de Radix trae `text-sm`: este lo sube a 16px y lo deja de 40px.
export const selectClass = "w-full text-base data-[size=default]:h-10";

// Lo que el control tiene que recibir para quedar ligado a su etiqueta, su ayuda y su error.
export interface FieldControlProps {
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-required"?: true;
}

interface FieldProps {
  // El `id` del control: la etiqueta apunta a él y de él salen los ids del error y de la ayuda.
  id: string;
  label: string;
  error?: string;
  // Un texto que explica el campo (por ejemplo, por qué está deshabilitado).
  hint?: string;
  required?: boolean;
  // Ícono de la etiqueta, en el color de la sección (`--sc`, ver FormSection).
  icon?: LucideIcon;
  // Contador «n/máx» a la derecha de la etiqueta, para los campos con tope de caracteres.
  counter?: { value: number; max: number };
  // Un control chico a la derecha de la etiqueta (por ejemplo, «Usar hoy»).
  action?: ReactNode;
  children: (control: FieldControlProps) => ReactNode;
}

// Etiqueta + control + ayuda + error de un campo de los formularios del ticket. El error y la ayuda se
// ligan al control con `aria-describedby`: sin eso un lector de pantalla no los lee al entrar al campo.
export function Field({
  id,
  label,
  error,
  hint,
  required,
  icon: Icon,
  counter,
  action,
  children,
}: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ");

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1">
          <Label htmlFor={id} className="text-[13px] text-foreground">
            {Icon && <Icon aria-hidden="true" className="size-4 text-(--sc)" />}
            {label}
          </Label>
          {/* Fuera del `<label>`: el nombre accesible del campo no incluye el asterisco. */}
          {required && (
            <span aria-hidden className="text-[13px] text-brand">
              *
            </span>
          )}
        </div>
        {action}
        {counter && (
          <span aria-hidden className="text-[13px] text-muted-foreground tabular-nums">
            {counter.value}/{counter.max}
          </span>
        )}
      </div>
      {children({
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
        "aria-required": required ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-[13px] text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

// «Usar hoy» junto a la fecha de recepción (va en la prop `action` de `Field`).
export function TodayButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      className="text-[13px] font-medium text-foreground underline"
      onClick={onClick}
    >
      Usar hoy
    </button>
  );
}
