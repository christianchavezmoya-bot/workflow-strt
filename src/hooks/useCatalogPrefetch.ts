import { useEffect, useRef, useState } from "react";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { fetchProjects } from "../store/projectSlice";
import { fetchProducts } from "../store/productsSlice";
import { fetchUsers } from "../store/usersSlice";
import offlineBootstrapService from "../services/offlineBootstrapService";
import { isFirstLoginQuietPending } from "../utils/postLoginQuietWindow";

/**
 * Warm the shared projects/products/users catalogs, at most once per mount.
 *
 * The per-catalog ref is what makes this safe on an empty database. Guarding only on
 * `items.length` (the previous shape of this code in Dashboard and AssetInstallationPage)
 * re-dispatches forever when the API legitimately answers with `[]`: the fetch flips
 * `loading` and leaves `length` at 0, the effect's deps change, the guard passes again,
 * and on web the request is served from the SWR cache with no network round-trip, so the
 * cycle runs at render speed and starves navigation.
 */
export function useCatalogPrefetch(enabled = true): void {
  const dispatch = useAppDispatch();
  const projects = useAppSelector((s) => s.projects.items);
  const projectsLoading = useAppSelector((s) => s.projects.loading);
  const products = useAppSelector((s) => s.products.items);
  const productsLoading = useAppSelector((s) => s.products.loading);
  const users = useAppSelector((s) => s.users.items);
  const usersLoading = useAppSelector((s) => s.users.loading);
  const requestedRef = useRef({ projects: false, products: false, users: false });
  const [bootstrapDoneTick, setBootstrapDoneTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const onBootstrapDone = () => setBootstrapDoneTick((tick) => tick + 1);
    window.addEventListener("bootstrap:complete", onBootstrapDone);
    window.addEventListener("bootstrap:error", onBootstrapDone);
    return () => {
      window.removeEventListener("bootstrap:complete", onBootstrapDone);
      window.removeEventListener("bootstrap:error", onBootstrapDone);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (isFirstLoginQuietPending() || offlineBootstrapService.isRunning()) return;
    const requested = requestedRef.current;

    if (!requested.projects && !projects.length && !projectsLoading) {
      requested.projects = true;
      dispatch(fetchProjects());
    }
    if (!requested.products && !products.length && !productsLoading) {
      requested.products = true;
      dispatch(fetchProducts());
    }
    if (!requested.users && !users.length && !usersLoading) {
      requested.users = true;
      dispatch(fetchUsers());
    }
  }, [
    bootstrapDoneTick,
    dispatch,
    enabled,
    products.length,
    productsLoading,
    projects.length,
    projectsLoading,
    users.length,
    usersLoading,
  ]);
}
