// Convención de eliminación lógica de los modelos de negocio (SPEC 03, Feature 3.4). Se escribe
// explícito en el `where` de cada repository: no hay una extensión de Prisma que filtre sola.
export const notDeleted = { deletedAt: null } as const;

// Datos del `update` que elimina un registro: nunca hay `DELETE` físico sobre modelos de negocio.
export function softDeleteData(actorId: string): { deletedAt: Date; updatedBy: string } {
  return { deletedAt: new Date(), updatedBy: actorId };
}
