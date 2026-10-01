import type { User } from "@syc/contracts";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { roleLabels } from "./RoleSelect";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, User>();

interface UsersTableProps {
  users: User[];
  currentUserId: string | undefined;
  onEdit: (user: User) => void;
  onToggleActive: (user: User) => void;
  onResetPassword: (user: User) => void;
}

export function UsersTable({
  users,
  currentUserId,
  onEdit,
  onToggleActive,
  onResetPassword,
}: UsersTableProps) {
  const columns = useMemo(
    () =>
      column.columns([
        column.accessor("username", { header: "Usuario" }),
        column.accessor("name", { header: "Nombre" }),
        column.accessor("role", {
          header: "Rol",
          cell: ({ row }) => roleLabels[row.original.role],
        }),
        column.display({
          id: "department",
          header: "Departamento",
          cell: ({ row }) => row.original.department?.nombre ?? "—",
        }),
        column.accessor("activo", {
          header: "Estado",
          cell: ({ row }) =>
            row.original.activo ? (
              <Badge variant="secondary">Activo</Badge>
            ) : (
              <Badge variant="destructive">Desactivado</Badge>
            ),
        }),
        column.display({
          id: "acciones",
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => {
            const user = row.original;
            const isSelf = user.id === currentUserId;
            return (
              <div className="flex justify-end gap-1">
                <Button variant="ghost" size="sm" onClick={() => onEdit(user)}>
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isSelf && user.activo}
                  title={isSelf ? "No podés desactivarte a vos mismo" : undefined}
                  onClick={() => onToggleActive(user)}
                >
                  {user.activo ? "Desactivar" : "Reactivar"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onResetPassword(user)}>
                  Resetear contraseña
                </Button>
              </div>
            );
          },
        }),
      ]),
    [currentUserId, onEdit, onToggleActive, onResetPassword],
  );
  const table = useTable({ features, columns, data: users });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id}>
            {group.headers.map((header) => (
              <TableHead key={header.id}>
                {header.isPlaceholder ? null : <table.FlexRender header={header} />}
              </TableHead>
            ))}
          </TableRow>
        ))}
      </TableHeader>
      <TableBody>
        {table.getRowModel().rows.map((row) => (
          <TableRow
            key={row.id}
            data-testid={`user-row-${row.original.username}`}
            className={row.original.activo ? undefined : "text-muted-foreground"}
          >
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
