import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

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
  children: (control: FieldControlProps) => ReactNode;
}

// Etiqueta + control + ayuda + error de un campo de los formularios del ticket. El error y la ayuda se
// ligan al control con `aria-describedby`: sin eso un lector de pantalla no los lee al entrar al campo.
export function Field({ id, label, error, hint, required, children }: FieldProps) {
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ");

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        <Label htmlFor={id}>{label}</Label>
        {/* Fuera del `<label>`: el nombre accesible del campo no incluye el asterisco. */}
        {required && (
          <span aria-hidden className="text-destructive">
            *
          </span>
        )}
      </div>
      {children({
        "aria-invalid": error ? true : undefined,
        "aria-describedby": describedBy || undefined,
        "aria-required": required ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-sm text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
