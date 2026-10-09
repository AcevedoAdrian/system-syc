import { useState } from "react";
import { getErrorMessage } from "@/lib/errors";

// El botón «Recargar» de un diálogo que chocó con otra edición (409): vuelve a leer el ticket y, si pudo,
// cierra el diálogo. Si falla no lo cierra y avisa por `onError`, para que quien lo mira pueda reintentar.
export function useReloadTicket(
  onReload: () => Promise<unknown>,
  onDone: () => void,
  onError: (message: string) => void,
) {
  const [reloading, setReloading] = useState(false);

  const reload = async () => {
    setReloading(true);
    try {
      await onReload();
      onDone();
    } catch (error) {
      onError(getErrorMessage(error));
    } finally {
      setReloading(false);
    }
  };

  return { reloading, reload };
}
