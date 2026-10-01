import { createFileRoute } from "@tanstack/react-router";
import { useCurrentUser } from "@/features/auth/hooks/useCurrentUser";
import { HealthStatusCard } from "@/features/health/components/HealthStatusCard";
import { useHealth } from "@/features/health/hooks/useHealth";

// Placeholder hasta SPEC 05 (bandeja de tickets).
function HomePage() {
  const { data: user } = useCurrentUser();
  const { data, isPending, isError } = useHealth();

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Hola, {user?.name}</h1>
      <HealthStatusCard data={data} isPending={isPending} isError={isError} />
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/")({
  component: HomePage,
});
