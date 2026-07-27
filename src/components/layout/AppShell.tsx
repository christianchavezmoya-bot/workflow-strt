import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import DebugPanel from "./DebugPanel";
import FieldNotificationBar from "../FieldNotificationBar";
import BottomTabBar from "./BottomTabBar";
import NotificationBanner from "./NotificationBanner";
import PullToRefresh from "./PullToRefresh";
import SyncDroppedBanner from "./SyncDroppedBanner";
import OfflineModeBanner from "./OfflineModeBanner";
import OfflineBootstrapBanner from "./OfflineBootstrapBanner";
import SyncBusyOverlay from "./SyncBusyOverlay";
import { useViewMode } from "../../contexts/ViewModeContext";
import { useMobileWebLayout } from "../../hooks/useMobileWebLayout";
import { useAccessMode } from "../../contexts/AccessModeContext";
import { FavoritesProvider } from "../../contexts/FavoritesContext";
import OnboardingController from "../../onboarding/OnboardingController";
import HelpCenterLauncher from "../../onboarding/components/HelpCenterLauncher";
import { useOnboarding } from "../../onboarding/hooks/useOnboarding";
import { useAuth } from "../../hooks/useAuth";
import { authService } from "../../services/authService";
import { useSseEvents } from "../../hooks/useSseEvents";
import { useOfflineBootstrap } from "../../hooks/useOfflineBootstrap";
import { useCallback, useEffect } from "react";
import { initTapFeedback } from "../../services/tapFeedback";

function OnboardingLayer() {
  const { user, authReady } = useAuth();

  if (!authReady || !user.id) return null;

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
  const { isViewOnly } = useAccessMode();
  const mobileWebLayout = useMobileWebLayout();
  useSseEvents(); // real-time push from server
  useOfflineBootstrap(); // keep offline cache warm (native only)

  useEffect(() => { initTapFeedback(); }, []);

  return (
    <FavoritesProvider>
      <Box className="app-shell">
        {/* Sidebar: desktop web only (hidden on mobile web + native via layout rules) */}
        {viewMode === "full" && !mobileWebLayout && <Sidebar />}
        <Box className={`app-main ${viewMode === "minimal" ? "minimal-view" : ""}`}>
          <NotificationBanner />
          <SyncDroppedBanner />
          <OfflineBootstrapBanner />
          <OfflineModeBanner />
          {isViewOnly && (
            <Box sx={{ px: 2, py: 1, borderBottom: "1px solid rgba(245, 158, 11, 0.25)", background: "rgba(245, 158, 11, 0.12)", color: "warning.light", fontSize: "0.85rem", fontWeight: 700 }}>
              View-only mode is active. Changes are disabled.
            </Box>
          )}
          <Topbar />
          <FieldNotificationBar />
          <PullToRefresh>
            <Box component="main" className="app-content">
              <Outlet />
            </Box>
          </PullToRefresh>
        </Box>
        {/* Bottom tab bar: mobile only (shown via CSS) */}
        <BottomTabBar />
        <SyncBusyOverlay />
        <DebugPanel />
        <OnboardingLayer />
      </Box>
    </FavoritesProvider>
  );
};

export default AppShell;
