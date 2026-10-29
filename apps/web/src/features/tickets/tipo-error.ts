// Igual que `modulo-error.ts`: el 400 de la API sobre el tipo del ticket («El tipo de ticket no existe o
// está desactivado») no trae el campo, y siempre empieza igual. El alta lo muestra bajo el campo «Tipo
// de ticket» y no solo en la barra de acciones (SPEC 12).
export const isTipoError = (message: string): boolean => message.startsWith("El tipo de ticket ");
