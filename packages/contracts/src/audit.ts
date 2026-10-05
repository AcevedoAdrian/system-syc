import { z } from "zod";

export const auditEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  actor: z.object({ id: z.string(), name: z.string() }).nullable(), // null = sistema
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime(),
});

export const auditHistorySchema = z.array(auditEntrySchema);

export type AuditEntry = z.infer<typeof auditEntrySchema>;
export type AuditHistory = z.infer<typeof auditHistorySchema>;
