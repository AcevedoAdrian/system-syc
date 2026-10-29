import type { CatalogRuta } from "@syc/contracts";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PowerIcon, Trash2Icon } from "lucide-react";
import { useMemo } from "react";
import { ActivePill } from "@/components/common/ActivePill";
import {
  tableBodyRowClass,
  tableCellClass,
  tableHeadCellClass,
  tableHeadRowClass,
} from "@/components/common/data-table";
import { RowAction } from "@/components/common/RowAction";
import { Badge } from "@/components/ui/badge";
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
  ruta: CatalogRuta;
  // Las filas que se muestran (una página, o lo que dejan la búsqueda y el filtro).
  items: CatalogEntry[];
  // Los ids de la lista completa, en su orden: la primera fila no puede subir y la última no puede bajar,
  // aunque la página mostrada sea otra. Sin esto, se toman las de `items`.
  orderIds?: string[];
  // Con una búsqueda o un filtro activos la lista es parcial y mover una fila no tiene sentido.
  canReorder?: boolean;
  onMove: (item: CatalogEntry, direccion: "subir" | "bajar") => void;
  onEdit: (item: CatalogEntry) => void;
  onToggleActive: (item: CatalogEntry) => void;
  onRemove: (item: CatalogEntry) => void;
}

// Proveedores suma sus datos de contacto; un campo sin cargar se muestra como "—".
const CONTACT_COLUMNS = [
  { key: "contacto", header: "Contacto" },
  { key: "telefono", header: "Teléfono" },
  { key: "correo", header: "Correo" },
  { key: "sitioWeb", header: "Sitio web" },
] as const;

export function CatalogTable({
  ruta,
  items,
  orderIds,
  canReorder = true,
  onMove,
  onEdit,
  onToggleActive,
  onRemove,
}: CatalogTableProps) {
  const order = orderIds ?? items.map((item) => item.id);

  const columns = useMemo(
    () =>
      column.columns([
        column.display({
          id: "orden",
          header: "Orden",
          cell: ({ row }) => {
            const { id, nombre } = row.original;
            return (
              <div className="-ml-2 flex">
                <RowAction
                  label={`Subir «${nombre}»`}
                  icon={ArrowUpIcon}
                  disabled={!canReorder || order[0] === id}
                  onClick={() => onMove(row.original, "subir")}
                />
                <RowAction
                  label={`Bajar «${nombre}»`}
                  icon={ArrowDownIcon}
                  disabled={!canReorder || order[order.length - 1] === id}
                  onClick={() => onMove(row.original, "bajar")}
                />
              </div>
            );
          },
        }),
        // Las áreas se muestran con su tipo en la primera columna de datos (SPEC 08).
        ...(ruta === "areas"
          ? [
              column.accessor((item) => item.tipo?.nombre ?? "—", {
                id: "tipo",
                header: "Tipo",
                cell: ({ row }) => (
                  <span className="text-body">{row.original.tipo?.nombre ?? "—"}</span>
                ),
              }),
            ]
          : []),
        // Los estados de sistema (los que tienen `clave`) se marcan, pero la clave no se muestra.
        column.accessor("nombre", {
          header: "Nombre",
          cell: ({ row }) => (
            <span className="flex items-center gap-2 font-medium text-foreground">
              {row.original.nombre}
              {row.original.clave && <Badge variant="outline">De sistema</Badge>}
            </span>
          ),
        }),
        ...(ruta === "proveedores"
          ? CONTACT_COLUMNS.map(({ key, header }) =>
              column.accessor(key, {
                header,
                cell: ({ row }) => <span className="text-body">{row.original[key] || "—"}</span>,
              }),
            )
          : []),
        // Los tipos de ticket muestran su descripción (SPEC 12). Una larga se corta para no ensanchar la
        // fila; el panel de edición muestra el texto entero.
        ...(ruta === "tipos"
          ? [
              column.accessor("descripcion", {
                header: "Descripción",
                cell: ({ row }) => (
                  <span
                    className="block max-w-md truncate text-body"
                    title={row.original.descripcion ?? undefined}
                  >
                    {row.original.descripcion || "—"}
                  </span>
                ),
              }),
            ]
          : []),
        // Los módulos muestran los departamentos a los que pertenecen (SPEC 11).
        ...(ruta === "modulos"
          ? [
              column.accessor((item) => item.departamentos?.map((dep) => dep.nombre).join(", "), {
                id: "departamentos",
                header: "Departamentos",
                cell: ({ row }) => (
                  <span className="text-body">
                    {row.original.departamentos?.map((dep) => dep.nombre).join(", ") || "—"}
                  </span>
                ),
              }),
            ]
          : []),
        column.accessor("activo", {
          header: "Estado",
          cell: ({ row }) => <ActivePill active={row.original.activo} />,
        }),
        column.display({
          id: "acciones",
          header: () => <span className="block text-right">Acciones</span>,
          cell: ({ row }) => {
            const { nombre, activo, clave } = row.original;
            return (
              <div className="flex justify-end">
                <RowAction
                  label={`Editar «${nombre}»`}
                  icon={PencilIcon}
                  onClick={() => onEdit(row.original)}
                />
                <RowAction
                  label={`${activo ? "Desactivar" : "Reactivar"} «${nombre}»`}
                  icon={PowerIcon}
                  onClick={() => onToggleActive(row.original)}
                />
                {!clave && (
                  <RowAction
                    label={`Eliminar «${nombre}»`}
                    icon={Trash2Icon}
                    destructive
                    onClick={() => onRemove(row.original)}
                  />
                )}
              </div>
            );
          },
        }),
      ]),
    [ruta, order, canReorder, onMove, onEdit, onToggleActive, onRemove],
  );
  const table = useTable({ features, columns, data: items });

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
            data-testid={`catalog-row-${row.original.nombre}`}
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
