import { oc } from "@orpc/contract";
import { z } from "zod";

export const healthStatusSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.enum(["up", "down"]),
  timestamp: z.iso.datetime(),
});

export type HealthStatus = z.infer<typeof healthStatusSchema>;

export const healthContract = {
  check: oc.route({ method: "GET", path: "/health" }).output(healthStatusSchema),
};
