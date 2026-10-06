import { formatTicketNumber, type TicketSummary } from "@syc/contracts";
import { Link } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDay } from "../ticket-format";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, TicketSummary>();

const linkClassName = "hover:underline";

// El número y el título abren el ticket. El orden es el que manda la API (fecha de recepción y número
// descendentes): la tabla solo renderiza la página recibida, no ordena ni filtra.
const columns = column.columns([
  column.accessor("numero", {
    header: "Número",
    cell: ({ row }) => (
      <Link
        to="/tickets/$ticketId"
        params={{ ticketId: row.original.id }}
        className={`${linkClassName} font-medium whitespace-nowrap`}
      >
        {formatTicketNumber(row.original.numero)}
      </Link>
    ),
  }),
  column.accessor("titulo", {
    header: "Título",
    cell: ({ row }) => (
      <Link
        to="/tickets/$ticketId"
        params={{ ticketId: row.original.id }}
        className={linkClassName}
      >
        {row.original.titulo}
      </Link>
    ),
  }),
  column.accessor((ticket) => ticket.departamento.nombre, {
    id: "departamento",
    header: "Departamento",
  }),
  column.accessor((ticket) => ticket.estado.nombre, {
    id: "estado",
    header: "Estado",
    cell: ({ row }) => <Badge variant="secondary">{row.original.estado.nombre}</Badge>,
  }),
  column.accessor((ticket) => ticket.prioridad.nombre, { id: "prioridad", header: "Prioridad" }),
  column.accessor((ticket) => ticket.area?.nombre ?? "—", { id: "area", header: "Área" }),
  column.accessor("fechaRecepcion", {
    header: "Fecha de recepción",
    cell: ({ row }) => formatDay(row.original.fechaRecepcion),
  }),
]);

export function TicketsTable({ tickets }: { tickets: TicketSummary[] }) {
  const table = useTable({ features, columns, data: tickets });

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
          <TableRow key={row.id} data-testid={`ticket-row-${row.original.numero}`}>
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
