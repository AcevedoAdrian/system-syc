import { oc } from "@orpc/contract";
import { z } from "zod";

const roleSchema = z.enum(["agente", "admin"]);

export const userSchema = z.object({
  id: z.string(),
  username: z.string(),
  name: z.string(),
  email: z.string().nullable(), // null si es el email interno <username>@syc.local
  role: roleSchema,
  activo: z.boolean(),
  department: z.object({ id: z.string(), nombre: z.string() }).nullable(),
});

export type User = z.infer<typeof userSchema>;

export const usersContract = {
  me: oc.route({ method: "GET", path: "/users/me" }).output(userSchema),
};
