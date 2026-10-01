import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { isUnauthorized } from "./errors";

let unauthorizedHandler: (() => void) | undefined;

// `main.tsx` lo registra (necesita el router): un 401 en cualquier llamada limpia la sesión en
// memoria y manda a `/login`.
export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

function onError(error: unknown) {
  if (isUnauthorized(error)) unauthorizedHandler?.();
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
  defaultOptions: {
    queries: { retry: (failureCount, error) => !isUnauthorized(error) && failureCount < 3 },
  },
});
