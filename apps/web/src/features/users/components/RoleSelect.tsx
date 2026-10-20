import { type FieldControlProps, selectClass } from "@/components/common/Field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const roleLabels = { agente: "Agente", admin: "Administrador" } as const;

// Los `aria-*` que entrega `Field` (obligatorio, ayuda) van al botón del selector.
interface RoleSelectProps extends FieldControlProps {
  id: string;
  value: "agente" | "admin";
  onChange: (value: "agente" | "admin") => void;
}

export function RoleSelect({ id, value, onChange, ...aria }: RoleSelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as "agente" | "admin")}>
      <SelectTrigger id={id} className={selectClass} {...aria}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="agente">{roleLabels.agente}</SelectItem>
        <SelectItem value="admin">{roleLabels.admin}</SelectItem>
      </SelectContent>
    </Select>
  );
}
