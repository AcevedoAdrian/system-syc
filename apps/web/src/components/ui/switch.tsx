import { cn } from "cn";
import { Switch as SwitchPrimitive } from "radix-ui";
import type * as React from "react";

// Interruptor de la maqueta: 44×26px. El apagado es `--neutral-dot` y no el gris claro de la maqueta,
// que sobre el fondo crema da 1,2:1 (un control necesita 3:1); el estado además se escribe al lado.
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        "peer relative inline-flex h-6.5 w-11 shrink-0 cursor-pointer items-center rounded-full border-0 bg-neutral-dot p-0 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-teal",
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 translate-x-0.75 rounded-full bg-primary-foreground shadow-sm transition-transform data-[state=checked]:translate-x-5.25"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
