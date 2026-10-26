import { randomInt } from "node:crypto";

// Sin los caracteres que se confunden al dictarlos o copiarlos a mano (0/O, 1/l/I).
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

// Contraseña aleatoria (CSPRNG, sin sesgo de módulo): 16 caracteres de un alfabeto de 56 son ~93 bits.
export function randomPassword(length = 16): string {
  return Array.from({ length }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}
