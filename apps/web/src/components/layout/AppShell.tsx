import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <Topbar />
      <div className="flex flex-1">
        <Sidebar />
        {/* `min-w-0`: sin esto, una tabla ancha empuja el contenido y la página scrollea de costado. */}
        <main className="min-w-0 flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
