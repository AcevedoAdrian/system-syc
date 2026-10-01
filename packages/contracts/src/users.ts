import { oc } from "@orpc/contract";
import { z } from "zod";

const usernameSchema = z
  .string()
  .min(3)
  .max(30)
  .regex(/^[a-z0-9_.]+$/i);
const nameSchema = z.string().trim().min(1).max(120);
const passwordSchema = z.string().min(8).max(128);
const roleSchema = z.enum(["agente", "admin"]);

export const createUserInputSchema = z
  .object({
    username: usernameSchema,
    name: nameSchema,
    email: z.email().optional(),
    password: passwordSchema,
    role: roleSchema,
    organizationId: z.string().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.role === "agente" && !value.organizationId) {
      ctx.addIssue({
        code: "custom",
        path: ["organizationId"],
        message: "Un agente debe tener un departamento",
      });
    }
    if (value.role === "admin" && value.organizationId) {
      ctx.addIssue({
        code: "custom",
        path: ["organizationId"],
        message: "Un admin no lleva departamento",
      });
    }
  });

// Que `organizationId` sea obligatorio depende del rol resultante (el actual del usuario si
// `role` no viene), así que esa regla la valida el service, no el esquema.
export const updateUserInputSchema = z.object({
  userId: z.string(),
  username: usernameSchema.optional(),
  name: nameSchema.optional(),
  email: z.email().nullable().optional(), // null = volver al email interno
  role: roleSchema.optional(),
  organizationId: z.string().optional(),
});

export const setUserActiveInputSchema = z.object({ userId: z.string(), activo: z.boolean() });

export const resetPasswordInputSchema = z.object({
  userId: z.string(),
  password: passwordSchema,
});

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
export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;
export type SetUserActiveInput = z.infer<typeof setUserActiveInputSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const usersContract = {
  me: oc.route({ method: "GET", path: "/users/me" }).output(userSchema),
  list: oc.route({ method: "GET", path: "/users" }).output(z.array(userSchema)),
  create: oc
    .route({ method: "POST", path: "/users" })
    .input(createUserInputSchema)
    .output(userSchema),
  update: oc
    .route({ method: "PATCH", path: "/users/{userId}" })
    .input(updateUserInputSchema)
    .output(userSchema),
  setActive: oc
    .route({ method: "POST", path: "/users/{userId}/active" })
    .input(setUserActiveInputSchema)
    .output(userSchema),
  resetPassword: oc
    .route({ method: "POST", path: "/users/{userId}/reset-password" })
    .input(resetPasswordInputSchema)
    .output(z.void()),
};
