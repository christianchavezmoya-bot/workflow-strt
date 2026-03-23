import { useEffect } from "react";
import AppRoutes from "./routes";
import { brandSettingsService } from "../services/brandSettingsService";

const App = () => {
  useEffect(() => {
    brandSettingsService.get().then((s) => {
      if (s.appName) document.title = s.appName;
    }).catch(() => {});
  }, []);

  return <AppRoutes />;
};

export default App;
