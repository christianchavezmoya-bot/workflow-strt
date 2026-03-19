import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import DebugPanel from "./DebugPanel";
import FieldNotificationBar from "../FieldNotificationBar";
import { useViewMode } from "../../contexts/ViewModeContext";
import { FavoritesProvider } from "../../contexts/FavoritesContext";

const AppShell = () => {
  const { viewMode } = useViewMode();

  return (
    <FavoritesProvider>
      <Box className="app-shell">
        {viewMode === "full" && <Sidebar />}
        <Box className={`app-main ${viewMode === "minimal" ? "minimal-view" : ""}`}>
          <Topbar />
          <FieldNotificationBar />
          <Box component="main" className="app-content">
            <Outlet />
          </Box>
        </Box>
        <DebugPanel />
      </Box>
    </FavoritesProvider>
  );
};

export default AppShell;
