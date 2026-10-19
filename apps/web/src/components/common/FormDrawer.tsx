import { cn } from "cn";
import { XIcon } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { FormEventHandler, ReactNode } from "react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";

interface FormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  // Lo lee un lector de pantalla al abrir el panel; no se ve.
  description: string;
  children: ReactNode;
}

// Panel lateral de 440px que entra por la derecha (SPEC 09, etapa 9.6): el título y un «×» arriba, y
// debajo el contenido, que suele ser un `DrawerForm`. Es un diálogo modal: atrapa el foco y se cierra con
// Escape. Al abrirse enfoca el primer campo, no el «×».
export function FormDrawer({ open, onOpenChange, title, description, children }: FormDrawerProps) {
  const content = useRef<HTMLDivElement>(null);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim duration-150 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          ref={content}
          onOpenAutoFocus={(event) => {
            const field = content.current?.querySelector<HTMLElement>(
              "input:not([type=hidden]):not([readonly]), textarea, [role=combobox]",
            );
            if (field) {
              event.preventDefault();
              field.focus();
            }
          }}
          className="fixed inset-y-0 right-0 z-50 flex w-110 max-w-full flex-col border-l bg-background text-base text-body shadow-dialog duration-200 outline-none data-open:animate-in data-open:slide-in-from-right data-closed:animate-out data-closed:slide-out-to-right"
        >
          <div className="flex items-center justify-between gap-4 border-b px-6 py-5">
            <DialogPrimitive.Title className="font-heading text-[28px] leading-tight font-medium tracking-[-0.02em] text-foreground">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                type="button"
                variant="outline"
                className="size-10 shrink-0 rounded-full text-foreground"
                aria-label="Cerrar"
              >
                <XIcon aria-hidden="true" />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="sr-only">
            {description}
          </DialogPrimitive.Description>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface DrawerFormProps {
  onSubmit: FormEventHandler<HTMLFormElement>;
  submitLabel: string;
  submitting?: boolean;
  // El error del servidor, sobre las acciones.
  error?: string;
  children: ReactNode;
  className?: string;
}

// El formulario de un panel: los campos con scroll y, fijas al pie, «Cancelar» (cierra el panel) y la
// acción que guarda.
export function DrawerForm({
  onSubmit,
  submitLabel,
  submitting,
  error,
  children,
  className,
}: DrawerFormProps) {
  return (
    <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className={cn("flex flex-1 flex-col gap-5 overflow-y-auto px-6 py-6", className)}>
        {children}
        {error && (
          <p role="alert" className="text-[13px] text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex justify-end gap-3 border-t px-6 py-4">
        <DialogPrimitive.Close asChild>
          <Button type="button" variant="outline" className="h-10 px-5">
            Cancelar
          </Button>
        </DialogPrimitive.Close>
        <Button type="submit" className="h-10 px-5" disabled={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
