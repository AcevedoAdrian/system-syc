import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
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
import type { CatalogEntry } from "../hooks/catalog-api";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, CatalogEntry>();

interface CatalogTableProps {
  items: CatalogEntry[];
  onMove: (item: CatalogEntry, direccion: "subir" | "bajar") => void;
  onEdit: (item: CatalogEntry) => void;
  onToggleActive: (item: CatalogEntry) => void;
  onRemove: (item: CatalogEntry) => void;
}

// `items` llega en el orden de `list`: la primera fila no puede subir y la última no puede bajar.
export function CatalogTable({
  items,
  onMove,
  onEdit,
  onToggleActive,
  onRemove,
}: CatalogTableProps) {
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
        column.display({
          id: "acciones",
          header: () => <span className="sr-only">Acciones</span>,
          cell: ({ row }) => (
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Subir ${row.original.nombre}`}
                disabled={row.index === 0}
                onClick={() => onMove(row.original, "subir")}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Bajar ${row.original.nombre}`}
                disabled={row.index === items.length - 1}
                onClick={() => onMove(row.original, "bajar")}
              >
                <ArrowDownIcon />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onEdit(row.original)}>
                Editar
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
    [items.length, onMove, onEdit, onToggleActive, onRemove],
  );
  const table = useTable({ features, columns, data: items });

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
          <TableRow key={row.id} data-testid={`catalog-row-${row.original.nombre}`}>
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
