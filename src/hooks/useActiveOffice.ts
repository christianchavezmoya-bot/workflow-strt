import { useCallback, useEffect, useState } from "react";

export type ActiveOffice = string;

const STORAGE_KEY = "active_office";
const DEFAULT_OFFICE = "All";

export const useActiveOffice = () => {
  const [activeOffice, setActiveOffice] = useState<ActiveOffice>(DEFAULT_OFFICE);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setActiveOffice(stored);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
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
    localStorage.setItem(STORAGE_KEY, office);
    window.dispatchEvent(new Event("active-office-changed"));
  }, []);

  return { activeOffice, updateActiveOffice };
};
