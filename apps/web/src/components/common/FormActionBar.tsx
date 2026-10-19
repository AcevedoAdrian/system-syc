import type { ReactNode } from "react";

interface FormActionBarProps {
  // Un aviso o un error a la izquierda (el resultado de la última acción).
  message?: ReactNode;
  children: ReactNode;
}

// La barra de acciones de un formulario: queda fija al pie de la ventana mientras se recorre la página.
export function FormActionBar({ message, children }: FormActionBarProps) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-end gap-3 border-t bg-background py-4">
      {message && <div className="mr-auto min-w-0 text-[13px]">{message}</div>}
      {children}
    </div>
  );
}
