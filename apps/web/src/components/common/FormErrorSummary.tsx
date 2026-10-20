// Aviso arriba de un formulario cuando el envío tuvo campos inválidos (SPEC 09, 9.7). El detalle de cada
// error sigue junto a su campo: esto solo avisa, para que uno que quedó fuera de la vista no pase
// desapercibido. Quien lo usa decide cuándo mostrarlo.
export function FormErrorSummary({ title }: { title: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive bg-background px-5 py-4 text-foreground"
    >
      <span className="font-medium">{title}</span> Los campos con error están marcados en rojo.
    </div>
  );
}
