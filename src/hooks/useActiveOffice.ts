import { useCallback, useEffect, useState } from "react";

export type ActiveOffice = "USA" | "Australia" | "South Africa" | "All";

const STORAGE_KEY = "active_office";

export const useActiveOffice = () => {
  const [activeOffice, setActiveOffice] = useState<ActiveOffice>("USA");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ActiveOffice | null;
    if (stored) {
      setActiveOffice(stored);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const stored = localStorage.getItem(STORAGE_KEY) as ActiveOffice | null;
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
