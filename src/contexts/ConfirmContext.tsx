import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import ConfirmDialog, { type ConfirmSeverity } from "../components/ui/ConfirmDialog";

export type ConfirmOptions = {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  severity?: ConfirmSeverity;
};

type ConfirmState = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  severity: ConfirmSeverity;
};

const defaultState: ConfirmState = {
  open: false,
  title: "Confirm",
  message: "",
  confirmLabel: "Confirm",
  cancelLabel: "Cancel",
  severity: "warning",
};

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | undefined>(undefined);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState>(defaultState);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const closeWith = useCallback((result: boolean) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setState((prev) => ({ ...prev, open: false }));
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({
        open: true,
        title: options.title ?? "Confirm",
        message: options.message,
        confirmLabel: options.confirmLabel ?? "Confirm",
        cancelLabel: options.cancelLabel ?? "Cancel",
        severity: options.severity ?? "warning",
      });
    });
  }, []);

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <ConfirmDialog
        open={state.open}
        title={state.title}
        message={state.message}
        confirmLabel={state.confirmLabel}
        cancelLabel={state.cancelLabel}
        severity={state.severity}
        onClose={() => closeWith(false)}
        onConfirm={() => closeWith(true)}
      />
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm must be used within ConfirmProvider");
  }
  return ctx;
}
