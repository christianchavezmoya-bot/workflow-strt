import { Office } from "../components/GlobalOfficeMap";

// Automatically determine API base URL based on current hostname
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_BASE) {
    return import.meta.env.VITE_API_BASE;
  }
  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  return `${protocol}//${hostname}:4000/api`;
};

const API_BASE = getApiBaseUrl();

// In-memory cache for offices (shared across all users in same session)
let officesCache: Office[] | null = null;

export const officesService = {
  async getAll(): Promise<Office[]> {
    try {
      const response = await fetch(`${API_BASE}/offices`, {
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include", // Include cookies for authentication
      });

      if (!response.ok) {
        // If endpoint doesn't exist yet, use localStorage as fallback
        if (response.status === 404) {
          console.warn("Backend /offices endpoint not found. Using localStorage fallback.");
          const stored = localStorage.getItem("globalOffices");
          officesCache = stored ? JSON.parse(stored) : [];
          return officesCache ?? [];
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
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
      const response = await fetch(`${API_BASE}/offices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(office)
      });

      if (!response.ok) {
        if (response.status === 404) {
          // Backend endpoint doesn't exist, use localStorage
          console.warn("Backend /offices endpoint not found. Using localStorage.");
          const id = `office-${Date.now()}`;
          const newOffice = { ...office, id };
          const all = await this.getAll();
          const updated = [...all, newOffice];
          localStorage.setItem("globalOffices", JSON.stringify(updated));
          officesCache = updated;
          return newOffice;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const newOffice = await response.json();

      // Update cache
      if (officesCache) {
        officesCache = [...officesCache, newOffice];
      }

      // Sync to localStorage as backup
      const all = await this.getAll();
      localStorage.setItem("globalOffices", JSON.stringify(all));

      return newOffice;
    } catch (error) {
      console.error("Error creating office:", error);
      // Fallback to localStorage
      const id = `office-${Date.now()}`;
      const newOffice = { ...office, id };
      const all = await this.getAll();
      const updated = [...all, newOffice];
      localStorage.setItem("globalOffices", JSON.stringify(updated));
      officesCache = updated;
      return newOffice;
    }
  },

  async update(id: string, office: Omit<Office, "id">): Promise<Office> {
    try {
      const response = await fetch(`${API_BASE}/offices/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(office)
      });

      if (!response.ok) {
        if (response.status === 404) {
          console.warn("Backend /offices endpoint not found. Using localStorage.");
          const all = await this.getAll();
          const updated = all.map((o) => (o.id === id ? { ...office, id } : o));
          localStorage.setItem("globalOffices", JSON.stringify(updated));
          officesCache = updated;
          return { ...office, id };
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const updatedOffice = await response.json();

      // Update cache
      if (officesCache) {
        officesCache = officesCache.map((o) => (o.id === id ? updatedOffice : o));
      }

      // Sync to localStorage
      const all = await this.getAll();
      localStorage.setItem("globalOffices", JSON.stringify(all));

      return updatedOffice;
    } catch (error) {
      console.error("Error updating office:", error);
      const all = await this.getAll();
      const updated = all.map((o) => (o.id === id ? { ...office, id } : o));
      localStorage.setItem("globalOffices", JSON.stringify(updated));
      officesCache = updated;
      return { ...office, id };
    }
  },

  async delete(id: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE}/offices/${id}`, {
        method: "DELETE",
        credentials: "include"
      });

      if (!response.ok && response.status !== 404) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Update cache
      if (officesCache) {
        officesCache = officesCache.filter((o) => o.id !== id);
      }

      // Update localStorage
      const all = await this.getAll();
      const filtered = all.filter((o) => o.id !== id);
      localStorage.setItem("globalOffices", JSON.stringify(filtered));
    } catch (error) {
      console.error("Error deleting office:", error);
      // Fallback: update cache and localStorage
      const all = await this.getAll();
      const filtered = all.filter((o) => o.id !== id);
      localStorage.setItem("globalOffices", JSON.stringify(filtered));
      officesCache = filtered;
    }
  }
};
