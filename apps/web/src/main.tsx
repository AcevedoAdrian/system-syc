import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { queryClient, setUnauthorizedHandler } from "./lib/query-client";
import { initTheme } from "./lib/theme";
import { routeTree } from "./routeTree.gen";

// El tema se aplica antes de pintar nada, para que no haya un destello del claro al abrir en oscuro.
initTheme();

// Una dirección inexistente, también anidada (`/admin/xyz`), se resuelve en la raíz: la pantalla de
// «Página no encontrada» no va dentro del marco autenticado.
const router = createRouter({ routeTree, notFoundMode: "root" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Un 401 en cualquier llamada (sesión vencida o revocada): se limpia lo que hay en memoria y se
// vuelve a `/login`, recordando adónde estaba el usuario.
setUnauthorizedHandler(() => {
  queryClient.clear();
  const { pathname, href } = router.state.location;
  if (pathname !== "/login") void router.navigate({ to: "/login", search: { redirect: href } });
});

const container = document.getElementById("root");
if (!container) throw new Error("No se encontró el elemento #root");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
