import { Office } from "../components/GlobalOfficeMap";
import api from "./api";
import { isMobileNativePlatform } from "../utils/platform";
import { shouldSkipBlockingFetch } from "./connectivityMonitor";

// In-memory cache for offices (shared across all users in same session)
let officesCache: Office[] | null = null;
let officesPromise: Promise<Office[]> | null = null;
let isMigrating = false; // Prevent infinite migration loops

function refreshNativeOfficesInBackground(): void {
  if (shouldSkipBlockingFetch()) return;
  void api.get<Office[]>("/offices")
    .then((response) => {
      officesCache = response.data;
      localStorage.setItem("globalOffices", JSON.stringify(response.data));
    })
    .catch(() => {});
}

export const officesService = {
  async getAll(): Promise<Office[]> {
    if (!isMobileNativePlatform()) {
      if (officesCache) return officesCache;
      if (officesPromise) return officesPromise;

      officesPromise = api.get<Office[]>("/offices")
        .then((response) => {
          officesCache = response.data;
          return response.data;
        })
        .catch((error) => {
          if (officesCache) return officesCache;
          throw error;
        })
        .finally(() => {
          officesPromise = null;
        });

      return officesPromise;
    }

    const storedRaw = localStorage.getItem("globalOffices");
    const stored = storedRaw ? JSON.parse(storedRaw) : [];

    if (Array.isArray(officesCache) && officesCache.length > 0) {
      refreshNativeOfficesInBackground();
      return officesCache;
    }

    if (Array.isArray(stored) && stored.length > 0) {
      officesCache = stored;
      refreshNativeOfficesInBackground();
      return stored;
    }

    try {
      const response = await api.get<Office[]>("/offices");
      const data = response.data;

      // If database is empty but localStorage has data, migrate it (only once)
      if (data.length === 0 && !isMigrating) {
        const stored = localStorage.getItem("globalOffices");
        if (stored) {
          const localOffices = JSON.parse(stored);
          if (localOffices.length > 0) {
            isMigrating = true; // Prevent recursive migrations
            console.log("Migrating offices from localStorage to database...");
            // Migrate each office to the database
            for (const office of localOffices) {
              try {
                await this.create(office);
              } catch (err) {
                console.warn("Failed to migrate office:", office, err);
              }
            }
            isMigrating = false;
            // Fetch again to get the migrated data with proper IDs
            try {
              const migratedResponse = await api.get<Office[]>("/offices");
              officesCache = migratedResponse.data;
              localStorage.setItem("globalOffices", JSON.stringify(migratedResponse.data));
              return migratedResponse.data;
            } catch (err) {
              console.warn("Failed to fetch migrated offices", err);
            }
          }
        }
      }

      officesCache = data;

      // Also sync to localStorage as backup
      localStorage.setItem("globalOffices", JSON.stringify(data));

      return data;
    } catch (error) {
      console.error("Error fetching offices:", error);
      // Return from cache or localStorage as fallback
      if (officesCache) return officesCache;

      const stored = localStorage.getItem("globalOffices");
      officesCache = stored ? JSON.parse(stored) : [];
      return officesCache ?? [];
    }
  },

  async create(office: Omit<Office, "id">): Promise<Office> {
    if (!isMobileNativePlatform()) {
      const response = await api.post<Office>("/offices", office);
      officesCache = officesCache ? [...officesCache, response.data] : [response.data];
      officesPromise = null;
      return response.data;
    }

    try {
      const response = await api.post<Office>("/offices", office);
      const newOffice = response.data;

      // Update cache
      if (officesCache) {
        officesCache = [...officesCache, newOffice];
      }

      // Sync to localStorage as backup (use cache instead of calling getAll)
      localStorage.setItem("globalOffices", JSON.stringify([...(officesCache || [])]));

      return newOffice;
    } catch (error) {
      console.error("Error creating office:", error);
      // Fallback to localStorage (don't call getAll to avoid infinite loop)
      const id = `office-${Date.now()}`;
      const newOffice = { ...office, id };
      const stored = localStorage.getItem("globalOffices");
      const all = stored ? JSON.parse(stored) : [];
      const updated = [...all, newOffice];
      localStorage.setItem("globalOffices", JSON.stringify(updated));
      officesCache = updated;
      return newOffice;
    }
  },

  async update(id: string, office: Omit<Office, "id">): Promise<Office> {
    if (!isMobileNativePlatform()) {
      const response = await api.put<Office>(`/offices/${id}`, office);
      const updatedOffice = response.data;
      if (officesCache) {
        officesCache = officesCache.map((o) => (o.id === id ? updatedOffice : o));
      }
      officesPromise = null;
      return updatedOffice;
    }

    try {
      const response = await api.put<Office>(`/offices/${id}`, office);
      const updatedOffice = response.data;

      // Update cache
      if (officesCache) {
        officesCache = officesCache.map((o) => (o.id === id ? updatedOffice : o));
      }

      // Sync to localStorage (use cache instead of calling getAll)
      localStorage.setItem("globalOffices", JSON.stringify([...(officesCache || [])]));

      return updatedOffice;
    } catch (error) {
      console.error("Error updating office:", error);
      // Fallback to localStorage (don't call getAll to avoid infinite loop)
      const stored = localStorage.getItem("globalOffices");
      const all = stored ? JSON.parse(stored) : [];
      const updated = all.map((o: Office) => (o.id === id ? { ...office, id } : o));
      localStorage.setItem("globalOffices", JSON.stringify(updated));
      officesCache = updated;
      return { ...office, id };
    }
  },

  async delete(id: string): Promise<void> {
    if (!isMobileNativePlatform()) {
      await api.delete(`/offices/${id}`);
      if (officesCache) {
        officesCache = officesCache.filter((o) => o.id !== id);
      }
      officesPromise = null;
      return;
    }

    try {
      await api.delete(`/offices/${id}`);

      // Update cache
      if (officesCache) {
        officesCache = officesCache.filter((o) => o.id !== id);
      }

      // Update localStorage (use cache instead of calling getAll)
      localStorage.setItem("globalOffices", JSON.stringify([...(officesCache || [])]));
    } catch (error) {
      console.error("Error deleting office:", error);
      // Fallback: update cache and localStorage (don't call getAll to avoid infinite loop)
      const stored = localStorage.getItem("globalOffices");
      const all = stored ? JSON.parse(stored) : [];
      const filtered = all.filter((o: Office) => o.id !== id);
      localStorage.setItem("globalOffices", JSON.stringify(filtered));
      officesCache = filtered;
    }
  }
};
