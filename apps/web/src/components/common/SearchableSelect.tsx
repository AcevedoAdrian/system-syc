import { cn } from "cn";
import { CheckIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { selectTriggerClass } from "@/components/ui/select";
import { normalizeSearch } from "@/lib/search";
import type { FieldControlProps } from "./Field";

export interface SearchableOption {
  value: string;
  label: string;
  // Contra qué se busca; por defecto, la etiqueta. Un área suma su tipo: «Diputado Acosta».
  searchText?: string;
}

export interface SearchableGroup {
  id: string;
  label: string;
  options: SearchableOption[];
}

// Cuántos caracteres hacen falta para que el texto recorte la lista.
export const SEARCH_MIN_CHARS = 3;

interface SearchableSelectProps extends FieldControlProps {
  id: string;
  // Valor elegido, o "" si no hay.
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchLabel: string;
  // Lo que muestra el botón con un valor elegido que no es una opción de `leadingOptions`.
  selectedLabel?: string;
  // Opciones sin grupo antes de todo («Sin asignar», «Todos»). Se ocultan mientras se filtra.
  leadingOptions?: SearchableOption[];
  groups: SearchableGroup[];
  // Opciones sin grupo, después de los grupos.
  rest?: SearchableOption[];
  minChars?: number;
  disabled?: boolean;
  // Algo que va dentro del botón, antes del valor (el punto de color de la prioridad).
  leading?: ReactNode;
  triggerClassName?: string;
}

// Un selector con un cuadro de búsqueda arriba de la lista (Popover + listbox propio). Se ve como el
// `Select` de Radix, pero el foco queda en el buscador: el `Select` captura las teclas y no admite un
// campo de texto adentro. Desde `minChars` caracteres la lista se recorta a las coincidencias, sin
// mayúsculas ni acentos.
export function SearchableSelect({
  id,
  value,
  onChange,
  placeholder = "Elegí una opción",
  searchLabel,
  selectedLabel,
  leadingOptions = [],
  groups,
  rest = [],
  minChars = SEARCH_MIN_CHARS,
  disabled,
  leading,
  triggerClassName,
  ...aria
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Sin valor activo, lo está la primera opción visible.
  const [activeValue, setActiveValue] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const hintId = `${listId}-hint`;

  const needle = normalizeSearch(query);
  const filtering = needle.length >= minChars;
  const matches = (option: SearchableOption) =>
    !filtering || normalizeSearch(option.searchText ?? option.label).includes(needle);
  const visibleLeading = filtering ? [] : leadingOptions;
  const visibleGroups = groups
    .map((group) => ({ ...group, options: group.options.filter(matches) }))
    .filter((group) => group.options.length > 0);
  const visibleRest = rest.filter(matches);
  const flat = [...visibleLeading, ...visibleGroups.flatMap((g) => g.options), ...visibleRest];

  const activeIndex =
    activeValue === undefined
      ? 0
      : Math.max(
          0,
          flat.findIndex((o) => o.value === activeValue),
        );
  const optionId = (index: number) => `${listId}-option-${index}`;
  const label = leadingOptions.find((o) => o.value === value)?.label ?? selectedLabel;

  useEffect(() => {
    if (open)
      document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
  });

  const changeOpen = (next: boolean) => {
    setOpen(next);
    setQuery("");
    setActiveValue(next ? value : undefined);
  };

  const choose = (next: string) => {
    onChange(next);
    changeOpen(false);
  };

  const onTriggerKeyDown = (event: KeyboardEvent) => {
    if (open || (event.key !== "ArrowDown" && event.key !== "ArrowUp")) return;
    event.preventDefault();
    changeOpen(true);
  };

  const onInputKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const next = flat[activeIndex + (event.key === "ArrowDown" ? 1 : -1)];
      if (next) setActiveValue(next.value);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const active = flat[activeIndex];
      if (active) choose(active.value);
    }
  };

  const renderOption = (option: SearchableOption) => {
    const index = flat.indexOf(option);
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents: el teclado lo maneja el buscador (aria-activedescendant).
      <div
        key={option.value}
        id={optionId(index)}
        role="option"
        tabIndex={-1}
        aria-selected={option.value === value}
        data-active={index === activeIndex}
        onClick={() => choose(option.value)}
        onMouseMove={() => option.value !== activeValue && setActiveValue(option.value)}
        className="relative flex w-full cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm select-none data-[active=true]:bg-accent data-[active=true]:text-accent-foreground"
      >
        {option.label}
        {option.value === value && (
          <span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
            <CheckIcon className="size-4" />
          </span>
        )}
      </div>
    );
  };

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          data-slot="select-trigger"
          data-size="default"
          data-placeholder={label === undefined ? "" : undefined}
          disabled={disabled}
          onKeyDown={onTriggerKeyDown}
          className={cn(selectTriggerClass, triggerClassName)}
          {...aria}
        >
          {leading}
          <span data-slot="select-value">{label ?? placeholder}</span>
          <ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-56 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <div className="relative border-b border-border p-1.5">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            ref={inputRef}
            role="combobox"
            aria-label={searchLabel}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={flat.length > 0 ? optionId(activeIndex) : undefined}
            aria-describedby={query !== "" && !filtering ? hintId : undefined}
            autoComplete="off"
            placeholder={`${searchLabel}…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveValue(undefined);
            }}
            onKeyDown={onInputKeyDown}
            className="h-9 pl-8"
          />
        </div>
        {query !== "" && !filtering && (
          <p id={hintId} className="px-3 pt-2 text-xs text-muted-foreground">
            Escribí al menos {minChars} letras para buscar.
          </p>
        )}
        <div
          id={listId}
          role="listbox"
          aria-label={searchLabel}
          className="max-h-64 overflow-y-auto p-1"
        >
          {visibleLeading.map(renderOption)}
          {visibleGroups.map((group) => (
            // biome-ignore lint/a11y/useSemanticElements: dentro de un listbox el grupo es `role="group"`; un <fieldset> no es hijo válido.
            <div
              key={group.id}
              role="group"
              aria-labelledby={`${listId}-${group.id}`}
              className="not-first:mt-1"
            >
              <div
                id={`${listId}-${group.id}`}
                className="px-1.5 py-1 text-xs text-muted-foreground"
              >
                {group.label}
              </div>
              {group.options.map(renderOption)}
            </div>
          ))}
          {visibleRest.map(renderOption)}
          {flat.length === 0 && (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">
              Sin coincidencias.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
