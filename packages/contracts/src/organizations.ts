import { oc } from "@orpc/contract";
import { z } from "zod";
import { auditHistorySchema } from "./audit.js";

const nombreSchema = z.string().trim().min(1).max(120);

export const organizationInputSchema = z.object({ nombre: nombreSchema });

export const renameOrganizationInputSchema = z.object({
  organizationId: z.string(),
  nombre: nombreSchema,
});

export const setOrganizationActiveInputSchema = z.object({
  organizationId: z.string(),
  activo: z.boolean(),
});

export const organizationIdInputSchema = z.object({ organizationId: z.string() });

export const organizationSchema = z.object({
  id: z.string(),
  nombre: z.string(),
  activo: z.boolean(),
  agentes: z.number().int(), // agentes asignados, activos o desactivados
});

export type Organization = z.infer<typeof organizationSchema>;
export type OrganizationInput = z.infer<typeof organizationInputSchema>;
export type RenameOrganizationInput = z.infer<typeof renameOrganizationInputSchema>;
export type SetOrganizationActiveInput = z.infer<typeof setOrganizationActiveInputSchema>;

export const organizationsContract = {
  list: oc.route({ method: "GET", path: "/organizations" }).output(z.array(organizationSchema)),
  create: oc
    .route({ method: "POST", path: "/organizations" })
    .input(organizationInputSchema)
    .output(organizationSchema),
  rename: oc
    .route({ method: "PATCH", path: "/organizations/{organizationId}" })
    .input(renameOrganizationInputSchema)
    .output(organizationSchema),
  setActive: oc
    .route({ method: "POST", path: "/organizations/{organizationId}/active" })
    .input(setOrganizationActiveInputSchema)
    .output(organizationSchema),
  remove: oc
    .route({ method: "DELETE", path: "/organizations/{organizationId}" })
    .input(organizationIdInputSchema)
    .output(z.void()),
  history: oc
    .route({ method: "GET", path: "/organizations/{organizationId}/history" })
    .input(organizationIdInputSchema)
    .output(auditHistorySchema),
};
