import type { CatalogItem, CatalogRuta, EstadoTicket, Proveedor } from "@syc/contracts";
import type { QueryKey, UseMutationOptions, UseQueryOptions } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc-client";

// Un ítem de cualquiera de los 7 catálogos: la base, más los campos que solo tienen Proveedores
// (contacto) y Estados (`clave`). La pantalla y los hooks trabajan con esta unión.
export type CatalogEntry = CatalogItem &
  Partial<Omit<Proveedor, keyof CatalogItem>> &
  Partial<Pick<EstadoTicket, "clave">>;

// Campos que el cliente puede mandar en un alta o una edición.
export type CatalogFormValues = { nombre: string } & Partial<
  Record<"contacto" | "telefono" | "correo" | "sitioWeb", string | null>
>;

interface Procedure<TInput, TOutput> {
  mutationOptions(options?: {
    onSuccess?: () => unknown;
  }): UseMutationOptions<TOutput, Error, TInput>;
}

// Cada catálogo tiene su propio contrato (Proveedor suma campos de entrada, Estados uno de salida),
// así que `orpc.catalogs[ruta]` es una unión que TypeScript no sabe llamar. Esta forma común es el
// único punto donde se afloja el tipado; el contrato sigue verificado en la API.
interface CatalogApi {
  key(): QueryKey;
  list: { queryOptions(): UseQueryOptions<CatalogEntry[], Error> };
  create: Procedure<CatalogFormValues, CatalogEntry>;
  update: Procedure<CatalogFormValues & { itemId: string }, CatalogEntry>;
  move: Procedure<{ itemId: string; direccion: "subir" | "bajar" }, void>;
  setActive: Procedure<{ itemId: string; activo: boolean }, CatalogEntry>;
  remove: Procedure<{ itemId: string }, void>;
}

export function catalogApi(ruta: CatalogRuta): CatalogApi {
  return orpc.catalogs[ruta] as unknown as CatalogApi;
}
