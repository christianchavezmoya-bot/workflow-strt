import { useEffect, useRef } from "react";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { fetchProjects } from "../store/projectSlice";
import { fetchProducts } from "../store/productsSlice";
import { fetchUsers } from "../store/usersSlice";
import { useAuth } from "./useAuth";

/** Prefetch projects/products/users once after auth so route pages skip cold catalog fetches. */
export function useShellCatalogBootstrap(): void {
  const dispatch = useAppDispatch();
  const { authReady } = useAuth();
  const bootedRef = useRef(false);

  const projects = useAppSelector((s) => s.projects.items);
  const projectsLoading = useAppSelector((s) => s.projects.loading);
  const products = useAppSelector((s) => s.products.items);
  const productsLoading = useAppSelector((s) => s.products.loading);
  const users = useAppSelector((s) => s.users.items);
  const usersLoading = useAppSelector((s) => s.users.loading);

  useEffect(() => {
    if (!authReady || bootedRef.current) return;
    bootedRef.current = true;

    if (!projects.length && !projectsLoading) dispatch(fetchProjects());
    if (!products.length && !productsLoading) dispatch(fetchProducts());
    if (!users.length && !usersLoading) dispatch(fetchUsers());
  }, [
    authReady,
    dispatch,
    products.length,
    productsLoading,
    projects.length,
    projectsLoading,
    users.length,
    usersLoading,
  ]);
}
