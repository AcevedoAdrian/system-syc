import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// --- Salida ------------------------------------------------------------------------------------

const useColor = process.stdout.isTTY;
const paint = (code, text) => (useColor ? `\x1b[${code}m${text}\x1b[0m` : text);
export const green = (t) => paint(32, t);
export const red = (t) => paint(31, t);
export const yellow = (t) => paint(33, t);
export const dim = (t) => paint(2, t);

// --- Aserciones --------------------------------------------------------------------------------

export function fail(message) {
  throw new Error(message);
}

export function assert(condition, message) {
  if (!condition) fail(message);
}

// `res` es la respuesta de `Client` (lib/client.mjs); `expected` es un estado o una lista de estados.
export function assertStatus(res, expected, label) {
  const allowed = Array.isArray(expected) ? expected : [expected];
  if (!allowed.includes(res.status)) {
    const body = res.text.length > 300 ? `${res.text.slice(0, 300)}…` : res.text;
    fail(`${label}: se esperaba ${allowed.join(" o ")} y llegó ${res.status} (${body})`);
  }
}

// --- Procesos y archivos -----------------------------------------------------------------------

export function run(command, args, { env, cwd = ROOT, input } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: env ?? process.env,
    encoding: "utf8",
    input,
    maxBuffer: 64 * 1024 * 1024,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

export function tail(text, lines = 25) {
  return text.trim().split("\n").slice(-lines).join("\n");
}

export function readJson(file) {
  return JSON.parse(readFileSync(path.join(ROOT, file), "utf8"));
}

export function walk(dir, filter = () => true) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".turbo") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) found.push(...walk(full, filter));
    else if (filter(full)) found.push(full);
  }
  return found;
}

export const rel = (file) => path.relative(ROOT, file);
