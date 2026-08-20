import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Alert, Snackbar } from "@mui/material";

export type ToastSeverity = "success" | "error" | "warning" | "info";

export type ToastOptions = {
  message: string;
  severity?: ToastSeverity;
  durationMs?: number;
};

type ToastState = ToastOptions & { id: number };

export type AppToastApi = {
  show: (message: string, severity?: ToastSeverity, durationMs?: number) => void;
  success: (message: string, durationMs?: number) => void;
  error: (message: string, durationMs?: number) => void;
  warning: (message: string, durationMs?: number) => void;
  info: (message: string, durationMs?: number) => void;
};

const AppToastContext = createContext<AppToastApi | undefined>(undefined);

export function AppToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);

  const hide = useCallback(() => setToast(null), []);

  const show = useCallback((message: string, severity: ToastSeverity = "info", durationMs = 5000) => {
    const trimmed = message.trim();
    if (!trimmed) return;
    setToast({ id: Date.now(), message: trimmed, severity, durationMs });
  }, []);

  const api = useMemo<AppToastApi>(() => ({
    show,
    success: (message, durationMs) => show(message, "success", durationMs),
    error: (message, durationMs) => show(message, "error", durationMs ?? 7000),
    warning: (message, durationMs) => show(message, "warning", durationMs ?? 6000),
    info: (message, durationMs) => show(message, "info", durationMs),
  }), [show]);

  return (
    <AppToastContext.Provider value={api}>
      {children}
      <Snackbar
        open={Boolean(toast)}
        autoHideDuration={toast?.durationMs ?? 5000}
        onClose={hide}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          key={toast?.id}
          severity={toast?.severity ?? "info"}
          onClose={hide}
          variant="filled"
          sx={{
            width: "100%",
            minWidth: 280,
            maxWidth: 480,
            bgcolor: "var(--panel)",
            border: "1px solid var(--stroke)",
            color: "text.primary",
            "& .MuiAlert-icon": { color: "inherit" },
          }}
        >
          {toast?.message}
        </Alert>
      </Snackbar>
    </AppToastContext.Provider>
  );
}

export function useAppToast(): AppToastApi {
  const ctx = useContext(AppToastContext);
  if (!ctx) {
    throw new Error("useAppToast must be used within AppToastProvider");
  }
  return ctx;
}
