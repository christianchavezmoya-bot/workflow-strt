import { useCallback, useEffect, useState } from "react";
import { isMobileNativePlatform } from "../utils/platform";

export type ActiveOffice = string;

const STORAGE_KEY = "active_office";
const DEFAULT_OFFICE = "All";

/** Desktop-only: phone + mobile web always default to "All" (no persisted office filter). */
function shouldPersistActiveOffice(): boolean {
  if (typeof window === "undefined") return false;
  if (isMobileNativePlatform()) return false;
  return window.matchMedia("(min-width: 769px)").matches;
}

export const useActiveOffice = () => {
  const [activeOffice, setActiveOffice] = useState<ActiveOffice>(DEFAULT_OFFICE);

  useEffect(() => {
    if (!shouldPersistActiveOffice()) {
      setActiveOffice(DEFAULT_OFFICE);
      return;
    }
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setActiveOffice(stored);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      if (!shouldPersistActiveOffice()) {
        setActiveOffice(DEFAULT_OFFICE);
        return;
      }
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setActiveOffice(stored);
      }
    };
    window.addEventListener("active-office-changed", handler);
    return () => window.removeEventListener("active-office-changed", handler);
  }, []);

  const updateActiveOffice = useCallback((office: ActiveOffice) => {
    setActiveOffice(office);
    if (shouldPersistActiveOffice()) {
      localStorage.setItem(STORAGE_KEY, office);
    }
    window.dispatchEvent(new Event("active-office-changed"));
  }, []);

  return { activeOffice, updateActiveOffice };
};
