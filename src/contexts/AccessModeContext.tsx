import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type AccessMode = "normal" | "view-only";

interface AccessModeContextType {
  accessMode: AccessMode;
  isViewOnly: boolean;
  setAccessMode: (mode: AccessMode) => void;
  toggleAccessMode: () => void;
}

const STORAGE_KEY = "app_access_mode";
const AccessModeContext = createContext<AccessModeContextType | undefined>(undefined);

export const AccessModeProvider = ({ children }: { children: ReactNode }) => {
  const [accessMode, setAccessModeState] = useState<AccessMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "view-only" ? "view-only" : "normal";
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, accessMode);
    window.dispatchEvent(new CustomEvent("app-access-mode-changed", { detail: { accessMode } }));
  }, [accessMode]);

  const value = useMemo<AccessModeContextType>(() => ({
    accessMode,
    isViewOnly: accessMode === "view-only",
    setAccessMode: setAccessModeState,
    toggleAccessMode: () => setAccessModeState((current) => current === "normal" ? "view-only" : "normal"),
  }), [accessMode]);

  return (
    <AccessModeContext.Provider value={value}>
      {children}
    </AccessModeContext.Provider>
  );
};

export const useAccessMode = () => {
  const context = useContext(AccessModeContext);
  if (!context) {
    throw new Error("useAccessMode must be used within AccessModeProvider");
  }

  return context;
};
