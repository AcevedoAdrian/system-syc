import type { Organization } from "@syc/contracts";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DepartmentSelectProps {
  id: string;
  value: string | undefined;
  onChange: (value: string) => void;
  departments: Organization[];
  placeholder?: string;
  invalid?: boolean;
  // Los que entrega el `Field` de los formularios de ticket: error, ayuda y campo obligatorio.
  "aria-describedby"?: string;
  "aria-required"?: boolean;
}

// Ofrece solo los departamentos activos: a uno desactivado no se le pueden asignar agentes nuevos.
export function DepartmentSelect({
  id,
  value,
  onChange,
  departments,
  placeholder = "Elegí un departamento",
  invalid,
  "aria-describedby": describedBy,
  "aria-required": required,
}: DepartmentSelectProps) {
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        className="w-full"
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        aria-required={required}
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {departments
          .filter((department) => department.activo)
          .map((department) => (
            <SelectItem key={department.id} value={department.id}>
              {department.nombre}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );
}
