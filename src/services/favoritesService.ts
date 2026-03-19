export interface UserFavorite {
  id: string;
  label: string;
  path: string;       // pathname + search, e.g. /installations/assets?product=X&project=Y
  createdAt: string;
}

const storageKey = (userId: string) => `favorites_${userId}`;

export const favoritesService = {
  load(userId: string): UserFavorite[] {
    try {
      const raw = localStorage.getItem(storageKey(userId));
      return raw ? (JSON.parse(raw) as UserFavorite[]) : [];
    } catch {
      return [];
    }
  },

  save(userId: string, favorites: UserFavorite[]): void {
    try {
      localStorage.setItem(storageKey(userId), JSON.stringify(favorites));
    } catch {}
  },

  add(userId: string, label: string, path: string): UserFavorite {
    const all = this.load(userId);
    const entry: UserFavorite = { id: `fav-${Date.now()}`, label, path, createdAt: new Date().toISOString() };
    this.save(userId, [...all, entry]);
    return entry;
  },

  remove(userId: string, id: string): void {
    this.save(userId, this.load(userId).filter((f) => f.id !== id));
  },

  rename(userId: string, id: string, label: string): void {
    this.save(userId, this.load(userId).map((f) => (f.id === id ? { ...f, label } : f)));
  },
};
