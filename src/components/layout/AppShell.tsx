import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import DebugPanel from "./DebugPanel";
import FieldNotificationBar from "../FieldNotificationBar";
import BottomTabBar from "./BottomTabBar";
import NotificationBanner from "./NotificationBanner";
import { useViewMode } from "../../contexts/ViewModeContext";
import { FavoritesProvider } from "../../contexts/FavoritesContext";
import OnboardingController from "../../onboarding/OnboardingController";
import HelpCenterLauncher from "../../onboarding/components/HelpCenterLauncher";
import { useOnboarding } from "../../onboarding/hooks/useOnboarding";
import { useAuth } from "../../hooks/useAuth";
import { authService } from "../../services/authService";
import { useCallback } from "react";

function OnboardingLayer() {
  const { user } = useAuth();

  // When the user finishes or skips welcome, mark IsFirstLogin=false on backend
  // so an admin reset (setting IsFirstLogin=true) is the only way to re-trigger it.
  const handleWelcomeDone = useCallback(() => {
    authService.updateProfile({ fullName: user.fullName, office: user.office }).catch(() => {});
  }, [user.fullName, user.office]);

  const controls = useOnboarding({
    userId: user.id,
    role: user.role,
    isFirstLogin: user.isFirstLogin,
    onWelcomeDone: handleWelcomeDone,
  });

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
        {/* Sidebar: desktop only (hidden on mobile via CSS) */}
        {viewMode === "full" && <Sidebar />}
        <Box className={`app-main ${viewMode === "minimal" ? "minimal-view" : ""}`}>
          <NotificationBanner />
          <Topbar />
          <FieldNotificationBar />
          <Box component="main" className="app-content">
            <Outlet />
          </Box>
        </Box>
        {/* Bottom tab bar: mobile only (shown via CSS) */}
        <BottomTabBar />
        <DebugPanel />
        <OnboardingLayer />
      </Box>
    </FavoritesProvider>
  );
};

export default AppShell;
