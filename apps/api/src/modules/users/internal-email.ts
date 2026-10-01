const INTERNAL_EMAIL_DOMAIN = "syc.local";

// Email que se guarda cuando el admin no carga uno (D4). No se muestra ni sirve para nada más.
export function toInternalEmail(username: string): string {
  return `${username.toLowerCase()}@${INTERNAL_EMAIL_DOMAIN}`;
}

export function isInternalEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${INTERNAL_EMAIL_DOMAIN}`);
}
