import { createFileRoute } from "@tanstack/react-router";
import { OrganizationsAdmin } from "@/features/organizations/components/OrganizationsAdmin";

export const Route = createFileRoute("/_authenticated/admin/departamentos")({
  component: OrganizationsAdmin,
});
