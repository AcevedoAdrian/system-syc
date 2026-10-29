import { zodResolver } from "@hookform/resolvers/zod";
import { type ModuloInput, moduloInputSchema } from "@syc/contracts";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { controlClass, Field } from "@/components/common/Field";
import { DrawerForm, FormDrawer } from "@/components/common/FormDrawer";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrganizations } from "@/features/organizations/hooks/useOrganizations";
import { getErrorMessage } from "@/lib/errors";
import type { CatalogEntry } from "../hooks/catalog-api";

interface ModuloFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  submitLabel: string;
  initial?: CatalogEntry | null;
  onSubmit: (values: ModuloInput) => Promise<unknown>;
}

// Una casilla por departamento activo, más los desactivados que el módulo ya tiene (marcados): así
// editar el módulo no obliga a quitarle un departamento que se desactivó después (SPEC 11).
function DepartamentosField({
  value,
  onChange,
  assignedIds,
  error,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  assignedIds: ReadonlySet<string>;
  error: boolean;
}) {
  const { data: departments = [] } = useOrganizations();
  const options = departments.filter((dep) => dep.activo || assignedIds.has(dep.id));
  const errorId = "departamentoIds-error";

  const toggle = (id: string, checked: boolean) =>
    onChange(checked ? [...value, id] : value.filter((current) => current !== id));

  return (
    <fieldset
      className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
      aria-describedby={error ? errorId : undefined}
    >
      <legend className="mb-1.5 flex gap-1 p-0 text-[13px] font-medium text-foreground">
        Departamentos
        <span aria-hidden className="text-brand">
          *
        </span>
      </legend>
      <div className="flex flex-col gap-1 rounded-lg border p-2">
        {options.map((dep) => (
          <div key={dep.id} className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5">
            <Checkbox
              id={`departamento-${dep.id}`}
              className="size-5"
              checked={value.includes(dep.id)}
              aria-invalid={error ? true : undefined}
              onCheckedChange={(checked) => toggle(dep.id, checked === true)}
            />
            <Label htmlFor={`departamento-${dep.id}`} className="text-base font-normal">
              {dep.activo ? dep.nombre : `${dep.nombre} (inactivo)`}
            </Label>
          </div>
        ))}
      </div>
      {error && (
        <p id={errorId} className="text-[13px] text-destructive">
          Elegí al menos un departamento.
        </p>
      )}
    </fieldset>
  );
}

function ModuloForm({
  submitLabel,
  initial,
  onSubmit,
  onDone,
}: Omit<ModuloFormDialogProps, "open" | "onOpenChange" | "title"> & { onDone: () => void }) {
  const [serverError, setServerError] = useState<string>();
  const assigned = initial?.departamentos ?? [];
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ModuloInput>({
    resolver: zodResolver(moduloInputSchema),
    defaultValues: {
      nombre: initial?.nombre ?? "",
      departamentoIds: assigned.map((dep) => dep.id),
    },
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
        hint="El nombre no puede repetirse dentro del catálogo."
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
      <Controller
        control={control}
        name="departamentoIds"
        render={({ field }) => (
          <DepartamentosField
            value={field.value}
            onChange={field.onChange}
            assignedIds={new Set(assigned.map((dep) => dep.id))}
            error={Boolean(errors.departamentoIds)}
          />
        )}
      />
    </DrawerForm>
  );
}

// Un panel lateral (SPEC 09, 9.6) para dar de alta o editar un módulo y elegir sus departamentos.
export function ModuloFormDialog({
  open,
  onOpenChange,
  title,
  ...formProps
}: ModuloFormDialogProps) {
  return (
    <FormDrawer
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Alta o edición de un módulo."
    >
      <ModuloForm {...formProps} onDone={() => onOpenChange(false)} />
    </FormDrawer>
  );
}
