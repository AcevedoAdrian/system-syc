import type { User } from "@syc/contracts";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { cn } from "cn";
import { KeyRoundIcon, PencilIcon } from "lucide-react";
import { useMemo } from "react";
import {
  tableBodyRowClass,
  tableCellClass,
  tableHeadCellClass,
  tableHeadRowClass,
} from "@/components/common/data-table";
import { RowAction } from "@/components/common/RowAction";
import { Switch } from "@/components/ui/switch";
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

// Un usuario desactivado se ve atenuado en el nombre y el usuario; las demás columnas no cambian.
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
        column.accessor("username", {
          header: "Usuario",
          cell: ({ row }) => (
            <span
              className={cn(
                "font-mono text-[13px]",
                row.original.activo ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {row.original.username}
            </span>
          ),
        }),
        column.accessor("name", {
          header: "Nombre",
          cell: ({ row }) => (
            <span
              className={cn(
                "font-medium",
                row.original.activo ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {row.original.name}
            </span>
          ),
        }),
        column.accessor("role", {
          header: "Rol",
          cell: ({ row }) => <span className="text-body">{roleLabels[row.original.role]}</span>,
        }),
        column.display({
          id: "department",
          header: "Departamento",
          cell: ({ row }) => (
            <span className="text-body">{row.original.department?.nombre ?? "—"}</span>
          ),
        }),
        column.display({
          id: "email",
          header: "Email",
          cell: ({ row }) => (
            <span className="block max-w-56 truncate text-muted-foreground">
              {row.original.email ?? "—"}
            </span>
          ),
        }),
        column.accessor("activo", {
          header: "Activo",
          cell: ({ row }) => {
            const user = row.original;
            const isSelf = user.id === currentUserId;
            return (
              <span className="flex items-center gap-2.5">
                <Switch
                  checked={user.activo}
                  disabled={isSelf && user.activo}
                  title={isSelf ? "No podés desactivarte a vos mismo" : undefined}
                  aria-label={`Usuario «${user.username}» activo`}
                  onCheckedChange={() => onToggleActive(user)}
                />
                <span className="text-[13px] text-muted-foreground">
                  {user.activo ? "Activo" : "Desactivado"}
                </span>
              </span>
            );
          },
        }),
        column.display({
          id: "acciones",
          header: () => <span className="block text-right">Acciones</span>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <RowAction
                label={`Editar «${row.original.username}»`}
                icon={PencilIcon}
                onClick={() => onEdit(row.original)}
              />
              <RowAction
                label={`Resetear contraseña de «${row.original.username}»`}
                icon={KeyRoundIcon}
                onClick={() => onResetPassword(row.original)}
              />
            </div>
          ),
        }),
      ]),
    [currentUserId, onEdit, onToggleActive, onResetPassword],
  );
  const table = useTable({ features, columns, data: users });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className={tableHeadRowClass}>
            {group.headers.map((header) => (
              <TableHead key={header.id} className={tableHeadCellClass}>
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
            className={tableBodyRowClass}
          >
            {row.getAllCells().map((cell) => (
              <TableCell key={cell.id} className={tableCellClass}>
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
