import { useEffect, useState } from "react";
import AppRoutes from "./routes";
import { brandSettingsService } from "../services/brandSettingsService";
import { getLaunchAuthMode } from "../services/biometricAuth";
import BiometricLockScreen from "../components/BiometricLockScreen";

const App = () => {
  // "checking" → "locked" → "unlocked"
  const [authMode, setAuthMode] = useState<"checking" | "locked" | "unlocked">("checking");

  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) document.title = s.appName;
    }).catch(() => {});

    const mode = getLaunchAuthMode();
    if (mode === "biometric-needed") {
      setAuthMode("locked");
    } else {
      // "not-native" (web), "no-session" (login page handles it), "grace-expired" (login page)
      setAuthMode("unlocked");
    }
  }, []);

  if (authMode === "checking") return null; // brief flash prevention

  if (authMode === "locked") {
    return <BiometricLockScreen onUnlocked={() => setAuthMode("unlocked")} />;
  }

  return <AppRoutes />;
};

export default App;
