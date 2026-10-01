import { changePasswordInputSchema } from "@syc/contracts";
import { z } from "zod";

// El contrato valida la contraseña; la confirmación es solo de la pantalla.
export const changePasswordFormSchema = changePasswordInputSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Las contraseñas no coinciden",
  });

export type ChangePasswordFormValues = z.infer<typeof changePasswordFormSchema>;
