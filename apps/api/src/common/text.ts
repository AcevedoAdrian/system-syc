// Clave de comparación para nombres únicos: sin mayúsculas, sin acentos y sin espacios sobrantes
// ("Técnico" = "tecnico"). Mismo criterio que los catálogos (Q14).
export function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

// kebab-case en minúsculas y sin acentos. Si colisiona con `taken`, suma el sufijo `-2`, `-3`, ...
export function uniqueSlug(value: string, taken: ReadonlySet<string>): string {
  const base =
    normalizeName(value)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "departamento";
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
