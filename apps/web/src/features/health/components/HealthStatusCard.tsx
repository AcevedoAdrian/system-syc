import type { HealthStatus } from "@syc/contracts";

interface HealthStatusCardProps {
  data: HealthStatus | undefined;
  isPending: boolean;
  isError: boolean;
}

export function HealthStatusCard({ data, isPending, isError }: HealthStatusCardProps) {
  if (isPending) return <p>Consultando estado…</p>;
  if (isError || !data) return <p>No se pudo conectar con la API.</p>;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
      <dt className="text-muted-foreground">Estado</dt>
      <dd data-testid="health-status">{data.status}</dd>
      <dt className="text-muted-foreground">Base de datos</dt>
      <dd data-testid="health-database">{data.database}</dd>
    </dl>
  );
}
