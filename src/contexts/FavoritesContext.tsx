import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { favoritesService, type UserFavorite } from "../services/favoritesService";
import { useAuth } from "../hooks/useAuth";

interface FavoritesContextValue {
  favorites: UserFavorite[];
  add: (label: string, path: string) => UserFavorite;
  remove: (id: string) => void;
  rename: (id: string, label: string) => void;
  isFavorited: (path: string) => boolean;
  getFavorite: (path: string) => UserFavorite | undefined;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? "local";

  const [favorites, setFavorites] = useState<UserFavorite[]>(() => favoritesService.load(userId));

  // Reload when userId changes (login / logout)
  useEffect(() => {
    setFavorites(favoritesService.load(userId));
  }, [userId]);

  const add = useCallback(
    (label: string, path: string) => {
      const entry = favoritesService.add(userId, label, path);
      setFavorites((prev) => [...prev, entry]);
      return entry;
    },
    [userId]
  );

  const remove = useCallback(
    (id: string) => {
      favoritesService.remove(userId, id);
      setFavorites((prev) => prev.filter((f) => f.id !== id));
    },
    [userId]
  );

  const rename = useCallback(
    (id: string, label: string) => {
      favoritesService.rename(userId, id, label);
      setFavorites((prev) => prev.map((f) => (f.id === id ? { ...f, label } : f)));
    },
    [userId]
  );

  const isFavorited = useCallback(
    (path: string) => favorites.some((f) => f.path === path),
    [favorites]
  );

  const getFavorite = useCallback(
    (path: string) => favorites.find((f) => f.path === path),
    [favorites]
  );

  return (
    <FavoritesContext.Provider value={{ favorites, add, remove, rename, isFavorited, getFavorite }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavoritesContext() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error("useFavoritesContext must be used inside FavoritesProvider");
  return ctx;
}
