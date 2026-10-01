import type { Organization } from "@syc/contracts";
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
        column.accessor("nombre", { header: "Nombre" }),
        column.accessor("activo", {
          header: "Estado",
          cell: ({ row }) =>
            row.original.activo ? (
              <Badge variant="secondary">Activo</Badge>
            ) : (
              <Badge variant="destructive">Desactivado</Badge>
            ),
        }),
        column.accessor("agentes", { header: "Agentes" }),
        column.display({
          id: "acciones",
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              <Button variant="ghost" size="sm" onClick={() => onRename(row.original)}>
                Renombrar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onToggleActive(row.original)}>
                {row.original.activo ? "Desactivar" : "Reactivar"}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onRemove(row.original)}>
                Eliminar
              </Button>
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
          <TableRow key={row.id} data-testid={`org-row-${row.original.nombre}`}>
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
