// Nominatim API for free geocoding (OpenStreetMap)
const NOMINATIM_URL = "https://nominatim.openstreetmap.org";

export interface GeocodingResult {
  lat: number;
  lng: number;
  displayName: string;
}

export const geocodingService = {
  /**
   * Convert address to coordinates
   */
  async geocode(city: string, state?: string, country?: string): Promise<GeocodingResult | null> {
    try {
      // Build search query
      const parts = [city, state, country].filter(Boolean);
      const query = parts.join(", ");

      const response = await fetch(
        `${NOMINATIM_URL}/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
        {
          headers: {
            "User-Agent": "Commtrac-Project-Studio" // Required by Nominatim
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }

      const results = await response.json();

      if (results.length === 0) {
        return null;
      }

      const result = results[0];
      return {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon),
        displayName: result.display_name
      };
    } catch (error) {
      console.error("Geocoding error:", error);
      return null;
    }
  },

  /**
   * Convert coordinates to address
   */
  async reverseGeocode(lat: number, lng: number): Promise<{
    city: string;
    state: string;
    country: string;
  } | null> {
    try {
      const response = await fetch(
        `${NOMINATIM_URL}/reverse?lat=${lat}&lon=${lng}&format=json`,
        {
          headers: {
            "User-Agent": "Commtrac-Project-Studio"
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Reverse geocoding failed: ${response.status}`);
      }

      const result = await response.json();
      const address = result.address;

      return {
        city: address.city || address.town || address.village || address.municipality || "",
        state: address.state || address.province || address.region || "",
        country: address.country || ""
      };
    } catch (error) {
      console.error("Reverse geocoding error:", error);
      return null;
    }
  }
};
