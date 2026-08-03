import { useCallback, useEffect, useState } from "react";
import { useAuth } from "./useAuth";

export type ActiveOffice = string;

const LEGACY_STORAGE_KEY = "active_office";

function storageKey(userId: string): string {
  return `active_office_${userId}`;
}

/** Default active global office from the signed-in user's profile office. */
export function defaultOfficeForUser(userOffice?: string): ActiveOffice {
  const trimmed = userOffice?.trim();
  return trimmed || "All";
}

function readStoredOffice(userId: string, userOffice?: string): ActiveOffice {
  const scoped = localStorage.getItem(storageKey(userId));
  if (scoped) return scoped;

  // Legacy shared key (pre per-user prefs) — keep one release for desktop filters.
  const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (legacy) return legacy;

  return defaultOfficeForUser(userOffice);
}

export const useActiveOffice = () => {
  const { user, authReady } = useAuth();
  const [activeOffice, setActiveOffice] = useState<ActiveOffice>(() =>
    defaultOfficeForUser(user.office),
  );

  useEffect(() => {
    if (!authReady || !user.id) {
      setActiveOffice(defaultOfficeForUser(user.office));
      return;
    }
    setActiveOffice(readStoredOffice(user.id, user.office));
  }, [authReady, user.id, user.office]);

  useEffect(() => {
    const handler = () => {
      if (!user.id) return;
      setActiveOffice(readStoredOffice(user.id, user.office));
    };
    window.addEventListener("active-office-changed", handler);
    return () => window.removeEventListener("active-office-changed", handler);
  }, [user.id, user.office]);

  const updateActiveOffice = useCallback((office: ActiveOffice) => {
    setActiveOffice(office);
    if (user.id) {
      localStorage.setItem(storageKey(user.id), office);
    } else {
      localStorage.setItem(LEGACY_STORAGE_KEY, office);
    }
    window.dispatchEvent(new Event("active-office-changed"));
  }, [user.id]);

  return { activeOffice, updateActiveOffice };
};
