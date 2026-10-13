import { zodResolver } from "@hookform/resolvers/zod";
import {
  type AreaInput,
  areaInputSchema,
  type CatalogItemInput,
  type CatalogRuta,
  catalogItemInputSchema,
} from "@syc/contracts";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getErrorMessage } from "@/lib/errors";
import { useCatalog } from "../hooks/useCatalog";

// Lo que el formulario manda: el nombre y, solo en Áreas, el tipo (SPEC 08).
type FormValues = CatalogItemInput & Partial<Pick<AreaInput, "tipoId">>;

interface CatalogItemFormDialogProps {
  // Con `areas` el formulario pide además el tipo, que es obligatorio.
  ruta?: CatalogRuta;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initialName?: string;
  initialTipoId?: string;
  onSubmit: (values: FormValues) => Promise<unknown>;
}

// Los tipos activos, más el que el área ya tiene si hoy está desactivado (marcado), para que
// renombrar el área no obligue a cambiarle el tipo.
function TipoSelect({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const { data: tipos = [] } = useCatalog("tiposArea");
  const options = tipos.filter((tipo) => tipo.activo || tipo.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id="tipoId" className="w-full" aria-invalid={invalid ? true : undefined}>
        <SelectValue placeholder="Elegí un tipo" />
      </SelectTrigger>
      <SelectContent>
        {options.map((tipo) => (
          <SelectItem key={tipo.id} value={tipo.id}>
            {tipo.activo ? tipo.nombre : `${tipo.nombre} (inactivo)`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CatalogItemForm({
  ruta,
  submitLabel,
  initialName,
  initialTipoId,
  onSubmit,
  onDone,
}: Omit<CatalogItemFormDialogProps, "open" | "onOpenChange" | "title"> & { onDone: () => void }) {
  const [serverError, setServerError] = useState<string>();
  const conTipo = ruta === "areas";
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(conTipo ? areaInputSchema : catalogItemInputSchema),
    defaultValues: conTipo
      ? { nombre: initialName ?? "", tipoId: initialTipoId ?? "" }
      : { nombre: initialName ?? "" },
  });

  const submit = handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      await onSubmit(values);
      onDone();
    } catch (error) {
      setServerError(getErrorMessage(error));
    }
  });

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          id="nombre"
          autoFocus
          aria-invalid={errors.nombre ? true : undefined}
          {...register("nombre")}
        />
        {errors.nombre && (
          <p className="text-sm text-destructive">
            El nombre es obligatorio (hasta 120 caracteres).
          </p>
        )}
      </div>
      {conTipo && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="tipoId">Tipo</Label>
          <Controller
            control={control}
            name="tipoId"
            render={({ field }) => (
              <TipoSelect
                value={field.value ?? ""}
                onChange={field.onChange}
                invalid={Boolean(errors.tipoId)}
              />
            )}
          />
          {errors.tipoId && <p className="text-sm text-destructive">Elegí un tipo.</p>}
        </div>
      )}
      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}
      <DialogFooter>
        <Button type="submit" disabled={isSubmitting}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function CatalogItemFormDialog({
  open,
  onOpenChange,
  title,
  ...formProps
}: CatalogItemFormDialogProps) {
  const conTipo = formProps.ruta === "areas";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {conTipo
              ? "El nombre no puede repetirse dentro del mismo tipo."
              : "El nombre no puede repetirse dentro del catálogo."}
          </DialogDescription>
        </DialogHeader>
        <CatalogItemForm {...formProps} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
