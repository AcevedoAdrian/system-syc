import { areaLabel, formatTicketNumber, type TicketSummary } from "@syc/contracts";
import { Link } from "@tanstack/react-router";
import { createColumnHelper, tableFeatures, useTable } from "@tanstack/react-table";
import { cn } from "cn";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDay } from "../ticket-format";
import { EstadoPill, PrioridadLabel } from "./TicketBadges";

const features = tableFeatures({});
const column = createColumnHelper<typeof features, TicketSummary>();

// El número abre el ticket (es el único enlace de la fila); el título es texto, que se parte en líneas
// hasta un ancho razonable para que uno largo no ensanche la tabla. El orden es el que manda la API
// (fecha de recepción y número descendentes): la tabla solo renderiza la página recibida, no ordena ni
// filtra.
const columns = column.columns([
  column.accessor("numero", {
    header: "Número",
    cell: ({ row }) => (
      <Link
        to="/tickets/$ticketId"
        params={{ ticketId: row.original.id }}
        className="inline-flex min-h-10 items-center font-mono text-[13px] font-medium whitespace-nowrap text-link tabular-nums underline-offset-4 hover:underline focus-visible:underline"
      >
        {formatTicketNumber(row.original.numero)}
      </Link>
    ),
  }),
  column.accessor("titulo", {
    header: "Título",
    cell: ({ row }) => (
      <span className="inline-block max-w-md align-top font-medium whitespace-normal text-foreground wrap-break-word">
        {row.original.titulo}
      </span>
    ),
  }),
  column.accessor((ticket) => ticket.departamento.nombre, {
    id: "departamento",
    header: "Departamento",
  }),
  column.accessor((ticket) => ticket.estado.nombre, {
    id: "estado",
    header: "Estado",
    cell: ({ row }) => <EstadoPill estado={row.original.estado} />,
  }),
  column.accessor((ticket) => ticket.prioridad.nombre, {
    id: "prioridad",
    header: "Prioridad",
    cell: ({ row }) => <PrioridadLabel prioridad={row.original.prioridad} />,
  }),
  column.accessor((ticket) => (ticket.area ? areaLabel(ticket.area) : "—"), {
    id: "area",
    header: "Área",
  }),
  column.accessor("fechaRecepcion", {
    header: "Fecha de recepción",
    cell: ({ row }) => (
      <time dateTime={row.original.fechaRecepcion} className="tabular-nums">
        {formatDay(row.original.fechaRecepcion)}
      </time>
    ),
  }),
]);

// El texto corrido va en `--body`; la fecha, atenuada.
const cellTone: Record<string, string> = {
  departamento: "text-body",
  prioridad: "text-body",
  area: "text-body",
  fechaRecepcion: "text-muted-foreground",
};

export function TicketsTable({ tickets }: { tickets: TicketSummary[] }) {
  const table = useTable({ features, columns, data: tickets });

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((group) => (
          <TableRow key={group.id} className="border-b-0 bg-muted hover:bg-muted">
            {group.headers.map((header) => (
              <TableHead
                key={header.id}
                className="h-10 px-4 text-[13px] text-muted-foreground first:pl-5 last:pr-5"
              >
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
            data-testid={`ticket-row-${row.original.numero}`}
            className="h-14 border-line-soft"
          >
            {row.getAllCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={cn("px-4 py-2 first:pl-5 last:pr-5", cellTone[cell.column.id])}
              >
                <table.FlexRender cell={cell} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
