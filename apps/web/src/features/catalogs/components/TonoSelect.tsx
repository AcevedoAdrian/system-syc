import { type Tono, tonos } from "@syc/contracts";
import { Badge, tonoLabels } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TonoSelectProps {
  value: Tono;
  onChange: (value: Tono) => void;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
}

// Desplegable de los 8 tonos (SPEC 10): cada opción es la insignia con el nombre del color («Rojo»),
// y el botón muestra la elegida con la misma insignia. El nombre va dentro de la insignia: el color
// nunca va solo.
export function TonoSelect({ value, onChange, id, invalid, disabled }: TonoSelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Tono)} disabled={disabled}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid ? true : undefined}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {tonos.map((tono) => (
          <SelectItem key={tono} value={tono}>
            <Badge tono={tono}>{tonoLabels[tono]}</Badge>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
