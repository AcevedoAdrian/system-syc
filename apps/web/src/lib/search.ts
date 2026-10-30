// Sin mayúsculas ni acentos, como el resto de las búsquedas del sistema.
export const normalizeSearch = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
