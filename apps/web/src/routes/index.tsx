import { createFileRoute } from "@tanstack/react-router";
import { HealthStatusCard } from "@/features/health/components/HealthStatusCard";
import { useHealth } from "@/features/health/hooks/useHealth";

function HomePage() {
  const { data, isPending, isError } = useHealth();

  return (
    <main className="p-8">
      <h1 className="mb-4 text-2xl font-semibold">system-syc</h1>
      <HealthStatusCard data={data} isPending={isPending} isError={isError} />
    </main>
  );
}

export const Route = createFileRoute("/")({
  component: HomePage,
});
