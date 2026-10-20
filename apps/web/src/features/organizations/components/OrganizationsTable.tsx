import type { Organization } from "@syc/contracts";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { cn } from "cn";
import { PencilIcon, Trash2Icon } from "lucide-react";
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

const features = tableFeatures({});
const column = createColumnHelper<typeof features, Organization>();

interface OrganizationsTableProps {
  organizations: Organization[];
  onRename: (organization: Organization) => void;
  onToggleActive: (organization: Organization) => void;
  onRemove: (organization: Organization) => void;
}

export function OrganizationsTable({
  organizations,
  onRename,
  onToggleActive,
  onRemove,
}: OrganizationsTableProps) {
  const columns = useMemo(
    () =>
      column.columns([
        column.accessor("nombre", {
          header: "Nombre",
          cell: ({ row }) => (
            <span
              className={cn(
                "font-medium",
                row.original.activo ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {row.original.nombre}
            </span>
          ),
        }),
        column.accessor("agentes", {
          header: "Agentes asignados",
          cell: ({ row }) => <span className="text-body">{row.original.agentes}</span>,
        }),
        column.accessor("activo", {
          header: "Activo",
          cell: ({ row }) => (
            <span className="flex items-center gap-2.5">
              <Switch
                checked={row.original.activo}
                aria-label={`Departamento «${row.original.nombre}» activo`}
                onCheckedChange={() => onToggleActive(row.original)}
              />
              <span className="text-[13px] text-muted-foreground">
                {row.original.activo ? "Activo" : "Desactivado"}
              </span>
            </span>
          ),
        }),
        column.display({
          id: "acciones",
          header: () => <span className="block text-right">Acciones</span>,
          cell: ({ row }) => (
            <div className="flex justify-end">
              <RowAction
                label={`Renombrar «${row.original.nombre}»`}
                icon={PencilIcon}
                onClick={() => onRename(row.original)}
              />
              <RowAction
                label={`Eliminar «${row.original.nombre}»`}
                icon={Trash2Icon}
                destructive
                onClick={() => onRemove(row.original)}
              />
            </div>
          ),
        }),
      ]),
    [onRename, onToggleActive, onRemove],
  );
  const table = useTable({ features, columns, data: organizations });

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
            data-testid={`org-row-${row.original.nombre}`}
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
