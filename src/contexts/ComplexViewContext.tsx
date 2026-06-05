import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import type { ReactNode } from "react";

interface ComplexViewCtx {
  complexViewActive: boolean;
  recordLogoTap: (role: string) => void;
}

const ComplexViewContext = createContext<ComplexViewCtx>({
  complexViewActive: false,
  recordLogoTap: () => {},
});

const ELIGIBLE_ROLES = new Set(["Admin", "Project Manager"]);
const TAP_THRESHOLD = 5;
const TAP_WINDOW_MS = 2500;

export function ComplexViewProvider({ children }: { children: ReactNode }) {
  const [complexViewActive, setComplexViewActive] = useState(false);
  const tapCount = useRef(0);
  const lastTap = useRef(0);

  const recordLogoTap = useCallback((role: string) => {
    if (!Capacitor.isNativePlatform()) return;
    if (!ELIGIBLE_ROLES.has(role)) return;

    const now = Date.now();
    if (now - lastTap.current > TAP_WINDOW_MS) tapCount.current = 0;
    lastTap.current = now;
    tapCount.current += 1;

    if (tapCount.current >= TAP_THRESHOLD) {
      tapCount.current = 0;
      setComplexViewActive(v => !v);
    }
  }, []);

  return (
    <ComplexViewContext.Provider value={{ complexViewActive, recordLogoTap }}>
      {children}
    </ComplexViewContext.Provider>
  );
}

export function useComplexView() {
  return useContext(ComplexViewContext);
}
