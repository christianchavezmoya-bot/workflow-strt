import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Network } from "@capacitor/network";
import {
  getNativeNetworkConnected,
  pingNow,
  subscribeServerReachable,
} from "../services/connectivityMonitor";
import {
  isOfflineModeActive,
  setOfflineModeActive,
} from "../services/offlineModeState";
import { isMobileNativePlatform } from "../utils/platform";

interface OfflineModeContextType {
  isOfflineMode: boolean;
  serverReachable: boolean | null;
  goOffline: () => void;
  goOnline: () => void;
}

const OfflineModeContext = createContext<OfflineModeContextType | undefined>(undefined);

export function OfflineModeProvider({ children }: { children: ReactNode }) {
  const [serverReachable, setServerReachable] = useState<boolean | null>(null);
  const [nativeConnected, setNativeConnected] = useState<boolean | null>(() =>
    isMobileNativePlatform()
      ? getNativeNetworkConnected()
      : (typeof navigator !== "undefined" ? navigator.onLine : true)
  );
  const [manualOffline, setManualOffline] = useState(isOfflineModeActive());
  const offlineRef = useRef(isOfflineModeActive());

  useEffect(() => {
    return subscribeServerReachable((reachable) => {
      setServerReachable(reachable);
    });
  }, []);

  useEffect(() => {
    if (!isMobileNativePlatform()) {
      const syncBrowserConnectivity = () => setNativeConnected(navigator.onLine);
      syncBrowserConnectivity();
      window.addEventListener("online", syncBrowserConnectivity);
      window.addEventListener("offline", syncBrowserConnectivity);
      return () => {
        window.removeEventListener("online", syncBrowserConnectivity);
        window.removeEventListener("offline", syncBrowserConnectivity);
      };
    }

    let active = true;
    let remove: (() => void) | undefined;

    setNativeConnected(getNativeNetworkConnected());
    void Network.getStatus()
      .then((status) => {
        if (active) setNativeConnected(status.connected);
      })
      .catch(() => {});

    void Network.addListener("networkStatusChange", (status) => {
      if (!active) return;
      setNativeConnected(status.connected);
    }).then((listener) => {
      remove = () => { void listener.remove(); };
    });

    return () => {
      active = false;
      remove?.();
    };
  }, []);

  useEffect(() => {
    if (manualOffline && nativeConnected !== false && serverReachable === true) {
      setManualOffline(false);
    }
  }, [manualOffline, nativeConnected, serverReachable]);

  const isOfflineMode =
    manualOffline || nativeConnected === false || serverReachable === false;

  useEffect(() => {
    const wasOffline = offlineRef.current;
    offlineRef.current = isOfflineMode;
    setOfflineModeActive(isOfflineMode);
    if (wasOffline && !isOfflineMode) {
      window.dispatchEvent(new Event("offline-mode-online"));
    }
  }, [isOfflineMode]);

  const goOffline = () => {
    setManualOffline(true);
  };

  const goOnline = () => {
    setManualOffline(false);
    pingNow();
  };

  return (
    <OfflineModeContext.Provider value={{ isOfflineMode, serverReachable, goOffline, goOnline }}>
      {children}
    </OfflineModeContext.Provider>
  );
}

export function useOfflineMode(): OfflineModeContextType {
  const context = useContext(OfflineModeContext);
  if (!context) {
    throw new Error("useOfflineMode must be used within an OfflineModeProvider");
  }
  return context;
}
