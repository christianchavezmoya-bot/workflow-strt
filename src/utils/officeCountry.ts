export type OfficeLike = {
  city?: string | null;
  state?: string | null;
  country?: string | null;
};

function aliasesForCountry(country: string) {
  const c = country.trim();
  if (!c) return [];
  const low = c.toLowerCase();

  // If the DB uses either "USA" or "United States", treat them as the same country.
  if (["usa", "us", "u.s.", "united states", "united states of america"].includes(low)) {
    return [c, "USA", "US", "U.S.", "United States", "United States of America"];
  }

  if (["uk", "u.k.", "united kingdom", "great britain", "britain"].includes(low)) {
    return [c, "UK", "U.K.", "United Kingdom", "Great Britain", "Britain"];
  }

  if (["uae", "u.a.e.", "united arab emirates"].includes(low)) {
    return [c, "UAE", "U.A.E.", "United Arab Emirates"];
  }

  return [c];
}

// Normalizes an "office" string (city, country, etc) to its country if possible.
// Falls back to the original string if we can't map it.
export function createCountryResolver(offices: OfficeLike[]) {
  const map = new Map<string, string>();

  for (const office of offices) {
    const city = (office.city ?? "").trim();
    const state = (office.state ?? "").trim();
    const country = (office.country ?? "").trim();
    if (!country) continue;

    // Always map the country to itself for stable lookups.
    for (const alias of aliasesForCountry(country)) {
      map.set(alias, country);
      map.set(alias.toLowerCase(), country);
    }

    if (state) {
      map.set(state, country);
      map.set(state.toLowerCase(), country);
    }

    if (city) {
      map.set(city, country);
      map.set(city.toLowerCase(), country);

      const cityCountry = `${city}, ${country}`;
      map.set(cityCountry, country);
      map.set(cityCountry.toLowerCase(), country);
    }
  }

  // Common Australian state abbreviations/names that show up in legacy "office" fields.
  const australianStates: Record<string, string> = {
    NSW: "Australia",
    "New South Wales": "Australia",
    VIC: "Australia",
    Victoria: "Australia",
    QLD: "Australia",
    Queensland: "Australia",
    WA: "Australia",
    "Western Australia": "Australia",
    SA: "Australia",
    "South Australia": "Australia",
    TAS: "Australia",
    Tasmania: "Australia",
    ACT: "Australia",
    "Australian Capital Territory": "Australia",
    NT: "Australia",
    "Northern Territory": "Australia"
  };

  for (const [state, country] of Object.entries(australianStates)) {
    map.set(state, country);
    map.set(state.toLowerCase(), country);
  }

  return (officeLocation: string) => {
    const value = (officeLocation ?? "").trim();
    if (!value) return value;
    const direct = map.get(value) ?? map.get(value.toLowerCase());
    if (direct) return direct;

    // Handle values like "NSW, Australia" or "Sydney, Australia" by trying the last segment as a country.
    if (value.includes(",")) {
      const last = value.split(",").slice(-1)[0].trim();
      const lastMatch = map.get(last) ?? map.get(last.toLowerCase());
      if (lastMatch) return lastMatch;
    }

    return value;
  };
}
