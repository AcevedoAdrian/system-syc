import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const roleLabels = { agente: "Agente", admin: "Administrador" } as const;

interface RoleSelectProps {
  id: string;
  value: "agente" | "admin";
  onChange: (value: "agente" | "admin") => void;
}

export function RoleSelect({ id, value, onChange }: RoleSelectProps) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as "agente" | "admin")}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="agente">{roleLabels.agente}</SelectItem>
        <SelectItem value="admin">{roleLabels.admin}</SelectItem>
      </SelectContent>
    </Select>
  );
}
