// Los 400 de la API sobre el módulo del ticket («El módulo no existe o está desactivado», «El módulo no
// es del departamento del ticket») no traen el campo: los formularios los reconocen por el mensaje, que
// siempre empieza igual, para mostrarlos bajo el campo «Módulo» y no solo en la barra de acciones.
export const isModuloError = (message: string): boolean => message.startsWith("El módulo ");
