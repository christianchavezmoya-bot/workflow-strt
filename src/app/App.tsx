import { useEffect, useState } from "react";
import AppRoutes from "./routes";
import { brandSettingsService } from "../services/brandSettingsService";
import { getLaunchAuthMode } from "../services/biometricAuth";
import { initSecureStorage } from "../services/secureStorage";
import BiometricLockScreen from "../components/BiometricLockScreen";

// Resolve whichever comes first: init or timeout
const initWithTimeout = (ms: number) =>
  Promise.race([
    initSecureStorage(),
    new Promise<void>((resolve) => setTimeout(resolve, ms)),
  ]);

const App = () => {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) document.title = s.appName;
    }).catch(() => {});

    // Give the Keychain plugin 1.5 s to respond — fall through on timeout
    initWithTimeout(1500)
      .then(() => {
        if (getLaunchAuthMode() === "biometric-needed") setLocked(true);
      })
      .catch(() => { /* stay unlocked */ });
  }, []);

  if (locked) {
    return <BiometricLockScreen onUnlocked={() => setLocked(false)} />;
  }

  return <AppRoutes />;
};

export default App;
