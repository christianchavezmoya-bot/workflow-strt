import { useEffect, useState } from "react";
import AppRoutes from "./routes";
import { brandSettingsService } from "../services/brandSettingsService";
import { getLaunchAuthMode } from "../services/biometricAuth";
import { initSecureStorage } from "../services/secureStorage";
import BiometricLockScreen from "../components/BiometricLockScreen";

const App = () => {
  // "checking" → "locked" | "unlocked"
  const [authMode, setAuthMode] = useState<"checking" | "locked" | "unlocked">("checking");

  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) document.title = s.appName;
    }).catch(() => {});

    // Init Keychain after mount (native bridge is ready at this point)
    initSecureStorage()
      .then(() => {
        const mode = getLaunchAuthMode();
        setAuthMode(mode === "biometric-needed" ? "locked" : "unlocked");
      })
      .catch(() => {
        // If Keychain init fails for any reason, fall through to normal app
        setAuthMode("unlocked");
      });
  }, []);

  if (authMode === "checking") return null;

  if (authMode === "locked") {
    return <BiometricLockScreen onUnlocked={() => setAuthMode("unlocked")} />;
  }

  return <AppRoutes />;
};

export default App;
