// "2026-10-01" → "01/10/2026". Se parte el texto en vez de usar `Date`: una fecha sin hora no tiene
// zona, y `new Date("2026-10-01")` la corre un día atrás en el hemisferio oeste.
export function formatDay(day: string): string {
  const [year, month, date] = day.split("-");
  return `${date}/${month}/${year}`;
}
