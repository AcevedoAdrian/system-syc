// Dice cuántos módulos usan un departamento. Lo implementa el módulo `catalogs`; `organizations` solo
// conoce este contrato, no la tabla `modulo_departamento` (SPEC 11, Feature 11.3). Mismo patrón que
// `TICKET_USAGE_READER`.
export const MODULE_USAGE_READER = Symbol("MODULE_USAGE_READER");

export interface ModuleUsageReader {
  // Módulos que tienen el departamento. Eliminar un módulo borra sus filas de la unión, así que solo
  // cuentan los no eliminados; la FK `Restrict` de `Organization` respalda el conteo.
  countByDepartment(departmentId: string): Promise<number>;
}
