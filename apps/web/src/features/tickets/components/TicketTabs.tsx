import { cn } from "cn";
import { Tabs } from "radix-ui";
import { type ReactNode, useState } from "react";

// Cada pestaña lleva su color (un punto y la raya de la activa). Las clases van completas para que
// Tailwind las encuentre.
const TABS = [
  { value: "datos", label: "Datos", dot: "bg-brand", active: "data-[state=active]:border-brand" },
  {
    value: "comentarios",
    label: "Comentarios",
    dot: "bg-blue",
    active: "data-[state=active]:border-blue",
  },
  {
    value: "historial",
    label: "Historial",
    dot: "bg-amber",
    active: "data-[state=active]:border-amber",
  },
] as const;

export type TicketTab = (typeof TABS)[number]["value"];

// Las pestañas del ticket (SPEC 09, etapa 9.5). Los tres paneles quedan montados y solo se oculta el
// inactivo: cambiar de pestaña no desmonta el formulario, así que no pierde lo que se escribió.
export function TicketTabs({ panels }: { panels: Record<TicketTab, ReactNode> }) {
  const [tab, setTab] = useState<TicketTab>("datos");

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(next) => setTab(next as TicketTab)}
      className="flex flex-col gap-6"
    >
      <Tabs.List aria-label="Secciones del ticket" className="flex flex-wrap gap-1 border-b">
        {TABS.map((item) => (
          <Tabs.Trigger
            key={item.value}
            value={item.value}
            className={cn(
              "-mb-px inline-flex h-11 items-center gap-2 border-0 border-b-[3px] border-transparent px-4 text-sm font-medium text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 data-[state=active]:text-foreground",
              item.active,
            )}
          >
            <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", item.dot)} />
            {item.label}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {TABS.map((item) => (
        <Tabs.Content
          key={item.value}
          value={item.value}
          forceMount
          hidden={tab !== item.value}
          className="flex flex-col gap-6 outline-none data-[state=inactive]:hidden"
        >
          {panels[item.value]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}
