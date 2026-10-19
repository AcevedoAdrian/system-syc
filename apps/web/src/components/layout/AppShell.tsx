import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

// Barra lateral de 248px y, a su derecha, la barra superior sobre el contenido. Por debajo de 808px
// la barra lateral pasa arriba (el `flex-wrap` y el `flex-basis` de cada columna lo resuelven solos).
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap items-stretch bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-[999_1_560px] flex-col">
        <Topbar />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
