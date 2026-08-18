import { useCatalogPrefetch } from "./useCatalogPrefetch";
import { useAuth } from "./useAuth";

/** Prefetch projects/products/users once after auth so route pages skip cold catalog fetches. */
export function useShellCatalogBootstrap(): void {
  const { authReady } = useAuth();
  useCatalogPrefetch(authReady);
}
