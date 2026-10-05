import { setupInfra, state, teardownInfra } from "./infra.mjs";
import { OPTIONS } from "./options.mjs";
import { skipReason } from "./spec.mjs";
import { dim, fail, green, red, tail, yellow } from "./util.mjs";

function selected(criterion) {
  if (OPTIONS.only.size > 0) return OPTIONS.only.has(criterion.id);
  return OPTIONS.spec === "all" || criterion.id.startsWith(`${OPTIONS.spec}.`);
}

// Ejecuta los criterios de los SPEC dados y devuelve el código de salida del proceso.
export async function runSpecs(specs) {
  const todo = specs.flatMap((spec) => spec.criteria).filter(selected);
  if (todo.length === 0) {
    console.error("Ningún criterio coincide con --spec / --only.");
    return 2;
  }

  // Los criterios `first` (turbo) van antes: su build deja `dist/` listo para la API y el seed.
  todo.sort((a, b) => Number(b.first) - Number(a.first));

  let infraError = null;
  if (todo.some((c) => c.infra)) {
    process.stdout.write(
      dim("Preparando entorno (build, base temporal, migraciones, seed, API)… "),
    );
    try {
      await setupInfra();
      console.log(dim("listo"));
    } catch (error) {
      infraError = error;
      console.log(red("falló"));
    }
  }

  process.once("SIGINT", async () => {
    await teardownInfra();
    process.exit(130);
  });

  const outcomes = [];
  for (const criterion of todo) {
    const started = Date.now();
    let outcome;
    try {
      if (criterion.infra && infraError) {
        fail(`no se pudo preparar el entorno: ${infraError.message}`);
      }
      const skipped = skipReason(await criterion.run());
      outcome = skipped ? { status: "skip", detail: skipped } : { status: "pass" };
    } catch (error) {
      outcome = { status: "fail", detail: error instanceof Error ? error.message : String(error) };
    }
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    const icon = { pass: green("✔"), fail: red("✘"), skip: yellow("○") }[outcome.status];
    console.log(`${icon} ${criterion.id.padEnd(5)} ${criterion.title} ${dim(`(${seconds}s)`)}`);
    if (outcome.detail) {
      const color = outcome.status === "fail" ? red : yellow;
      const indented = outcome.detail
        .split("\n")
        .map((l) => `    ${l}`)
        .join("\n");
      console.log(color(indented));
    }
    outcomes.push({ ...criterion, ...outcome });
  }

  await teardownInfra();

  const count = (s) => outcomes.filter((o) => o.status === s).length;
  const failed = count("fail");
  console.log(
    `\n${green(`${count("pass")} ok`)}, ${failed ? red(`${failed} fallan`) : "0 fallan"}, ${yellow(`${count("skip")} omitidos`)} de ${outcomes.length} criterios.`,
  );
  if (failed > 0 && state.api && state.apiLog) {
    console.log(dim(`\nÚltimo log de la API:\n${tail(state.apiLog, 15)}`));
  }
  return failed > 0 ? 1 : 0;
}
