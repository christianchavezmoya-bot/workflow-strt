import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import DebugPanel from "./DebugPanel";
import FieldNotificationBar from "../FieldNotificationBar";
import BottomTabBar from "./BottomTabBar";
import { useViewMode } from "../../contexts/ViewModeContext";
import { FavoritesProvider } from "../../contexts/FavoritesContext";

const AppShell = () => {
  const { viewMode } = useViewMode();

  return (
    <FavoritesProvider>
      <Box className="app-shell">
        {/* Sidebar: desktop only (hidden on mobile via CSS) */}
        {viewMode === "full" && <Sidebar />}
        <Box className={`app-main ${viewMode === "minimal" ? "minimal-view" : ""}`}>
          <Topbar />
          <FieldNotificationBar />
          <Box component="main" className="app-content">
            <Outlet />
          </Box>
        </Box>
        {/* Bottom tab bar: mobile only (shown via CSS) */}
        <BottomTabBar />
        <DebugPanel />
      </Box>
    </FavoritesProvider>
  );
};

export default AppShell;
