import { createFileRoute } from "@tanstack/react-router";
import { UsersAdmin } from "@/features/users/components/UsersAdmin";

export const Route = createFileRoute("/_authenticated/admin/usuarios")({
  component: UsersAdmin,
});
