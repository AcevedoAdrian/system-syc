import { z } from "zod";

// El login y el cambio de contraseña propio pasan por la allowlist de Better Auth (`/api/auth/*`),
// no por oRPC: estos esquemas validan los formularios de la web.
export const loginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(128),
});

export type LoginInput = z.infer<typeof loginInputSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordInputSchema>;
