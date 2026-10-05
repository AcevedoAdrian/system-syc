// Opciones de la línea de comandos de `pnpm verify` (ver el encabezado de verify-acceptance.mjs).
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

export const OPTIONS = {
  spec: option("spec") ?? "all",
  only: new Set((option("only") ?? "").split(",").filter(Boolean)),
  skipTurbo: flag("skip-turbo"),
  keepDb: flag("keep-db"),
};
