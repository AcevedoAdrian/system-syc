// Tema claro/oscuro. La clase `dark` en <html> es la única fuente de verdad (`@custom-variant dark`
// de index.css); la elección del usuario se recuerda en localStorage.
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "syc-theme";

const listeners = new Set<() => void>();

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    // Sin localStorage (ventana privada, sitio bloqueado): el tema vale solo para esta sesión.
    return null;
  }
}

// `matchMedia` no existe en jsdom.
function systemTheme(): Theme {
  const dark =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;
  return dark ? "dark" : "light";
}

function apply(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// Se llama una vez, antes de renderizar, para que la primera pintura ya salga con el tema.
export function initTheme() {
  apply(readStored() ?? systemTheme());
}

export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme) {
  apply(theme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ver `readStored`.
  }
  for (const listener of listeners) listener();
}

export function subscribeTheme(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
