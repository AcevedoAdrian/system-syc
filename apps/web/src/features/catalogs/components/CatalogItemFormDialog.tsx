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
import { controlClass, Field, selectClass } from "@/components/common/Field";
import { DrawerForm, FormDrawer } from "@/components/common/FormDrawer";
import { Input } from "@/components/ui/input";
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
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  describedBy?: string;
}) {
  const { data: tipos = [] } = useCatalog("tiposArea");
  const options = tipos.filter((tipo) => tipo.activo || tipo.id === value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        id="tipoId"
        className={selectClass}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        aria-required
      >
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
    <DrawerForm
      onSubmit={submit}
      submitLabel={submitLabel}
      submitting={isSubmitting}
      error={serverError}
    >
      <Field
        id="nombre"
        label="Nombre"
        required
        hint={
          conTipo
            ? "El nombre no puede repetirse dentro del mismo tipo."
            : "El nombre no puede repetirse dentro del catálogo."
        }
        error={errors.nombre && "El nombre es obligatorio (hasta 120 caracteres)."}
      >
        {(aria) => (
          <Input
            id="nombre"
            autoFocus
            maxLength={120}
            placeholder="Nombre del registro"
            className={controlClass}
            {...aria}
            {...register("nombre")}
          />
        )}
      </Field>
      {conTipo && (
        <Field id="tipoId" label="Tipo de área" required error={errors.tipoId && "Elegí un tipo."}>
          {(aria) => (
            <Controller
              control={control}
              name="tipoId"
              render={({ field }) => (
                <TipoSelect
                  value={field.value ?? ""}
                  onChange={field.onChange}
                  invalid={Boolean(errors.tipoId)}
                  describedBy={aria["aria-describedby"]}
                />
              )}
            />
          )}
        </Field>
      )}
    </DrawerForm>
  );
}

// Un panel lateral (SPEC 09, 9.6) para dar de alta o editar un ítem de catálogo.
export function CatalogItemFormDialog({
  open,
  onOpenChange,
  title,
  ...formProps
}: CatalogItemFormDialogProps) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Alta o edición de un registro del catálogo."
    >
      <CatalogItemForm {...formProps} onDone={() => onOpenChange(false)} />
    </FormDrawer>
  );
}
