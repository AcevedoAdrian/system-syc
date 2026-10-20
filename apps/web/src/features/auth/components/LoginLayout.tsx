import type { ReactNode } from "react";
import { Logo } from "@/components/common/Logo";
import { ThemeToggle } from "@/components/common/ThemeToggle";

// Dos paneles (marca y formulario) que se apilan por debajo de 960px. La línea de corte con
// muescas, a modo de ticket partido, solo se dibuja cuando están lado a lado.
export function LoginLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex flex-wrap content-start items-stretch overflow-hidden bg-background min-[960px]:min-h-screen min-[960px]:content-stretch">
      <section
        aria-label="system-syc"
        className="relative z-10 flex min-w-0 flex-[5_1_480px] flex-col items-center justify-center gap-5 text-center bg-muted px-6 py-8 min-[960px]:p-14"
      >
        <Logo height={72} />
        <p className="max-w-80 text-lg leading-normal text-muted-foreground">
          Gestión interna y seguimiento de tickets.
        </p>
        <div
          aria-hidden="true"
          className="absolute inset-y-0 -right-px hidden w-0 border-r-2 border-dashed border-muted-foreground opacity-40 min-[960px]:block"
        />
        <div
          aria-hidden="true"
          className="absolute -top-3.5 -right-3.5 hidden size-7 rounded-full bg-background min-[960px]:block"
        />
        <div
          aria-hidden="true"
          className="absolute -right-3.5 -bottom-3.5 hidden size-7 rounded-full bg-background min-[960px]:block"
        />
      </section>
      <main className="flex min-w-0 flex-[6_1_480px] flex-col bg-background px-6 pt-4 pb-10 min-[960px]:px-14 min-[960px]:pt-6 min-[960px]:pb-14">
        <div className="flex justify-end">
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-center justify-center">{children}</div>
      </main>
    </div>
  );
}
