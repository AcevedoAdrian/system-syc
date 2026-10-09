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

const linkClassName = "hover:underline focus-visible:underline";

// El título abre el ticket; el número es solo texto, para no repetir el mismo enlace dos veces por fila
// (dos paradas de Tab y dos enlaces iguales para un lector de pantalla). El orden es el que manda la API
// (fecha de recepción y número descendentes): la tabla solo renderiza la página recibida, no ordena ni filtra.
const columns = column.columns([
  column.accessor("numero", {
    header: "Número",
    cell: ({ row }) => (
      <span className="font-medium whitespace-nowrap tabular-nums">
        {formatTicketNumber(row.original.numero)}
      </span>
    ),
  }),
  column.accessor("titulo", {
    header: "Título",
    cell: ({ row }) => (
      <Link
        to="/tickets/$ticketId"
        params={{ ticketId: row.original.id }}
        // La celda no corta líneas; el título sí, hasta un ancho razonable, para que uno largo no ensanche la tabla.
        className={`${linkClassName} inline-block max-w-md align-top whitespace-normal wrap-break-word`}
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
    cell: ({ row }) => (
      <time dateTime={row.original.fechaRecepcion} className="tabular-nums">
        {formatDay(row.original.fechaRecepcion)}
      </time>
    ),
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
