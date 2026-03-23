import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import DebugPanel from "./DebugPanel";
import FieldNotificationBar from "../FieldNotificationBar";
import { useViewMode } from "../../contexts/ViewModeContext";
import { FavoritesProvider } from "../../contexts/FavoritesContext";
import OnboardingController from "../../onboarding/OnboardingController";
import HelpCenterLauncher from "../../onboarding/components/HelpCenterLauncher";
import { useOnboarding } from "../../onboarding/hooks/useOnboarding";
import { useAuth } from "../../hooks/useAuth";

function OnboardingLayer() {
  const { user } = useAuth();
  const controls = useOnboarding({ userId: user.id, role: user.role });
  return (
    <>
      <OnboardingController
        controls={controls}
        userId={user.id}
        role={user.role}
        userName={user.fullName}
      />
      <HelpCenterLauncher controls={controls} />
    </>
  );
}

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
        <OnboardingLayer />
      </Box>
    </FavoritesProvider>
  );
};

export default AppShell;
