import { Office } from "../components/GlobalOfficeMap";
import api from "./api";

// In-memory cache for offices (shared across all users in same session)
let officesCache: Office[] | null = null;
let isMigrating = false; // Prevent infinite migration loops

export const officesService = {
  async getAll(): Promise<Office[]> {
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
