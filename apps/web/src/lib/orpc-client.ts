import { createORPCClient } from "@orpc/client";
import type { ContractRouterClient } from "@orpc/contract";
import { OpenAPILink } from "@orpc/openapi-client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { contract } from "@syc/contracts";
import { env } from "./env";

const link = new OpenAPILink(contract, {
  url: env.VITE_API_URL,
  // La sesión viaja en una cookie: la API está en otro origen (CORS con credenciales).
  fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
});

export const client: ContractRouterClient<typeof contract> = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
