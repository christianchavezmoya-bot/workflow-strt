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
import NativeLifecycleBanner from "./NativeLifecycleBanner";
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
import { useShellCatalogBootstrap } from "../../hooks/useShellCatalogBootstrap";
import { useCallback, useEffect } from "react";
import { initTapFeedback } from "../../services/tapFeedback";
import type { User } from "../../types/user";

/** Runs onboarding hooks only when a real user id exists (stable hook order per mount). */
function OnboardingLayerContent({ user }: { user: User }) {
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

function OnboardingLayer() {
  const { user, authReady } = useAuth();

  if (!authReady || !user.id) return null;

  return <OnboardingLayerContent user={user} />;
}

const AppShell = () => {
  const { viewMode } = useViewMode();
  const { isViewOnly } = useAccessMode();
  const mobileWebLayout = useMobileWebLayout();
  useSseEvents(); // real-time push from server
  useOfflineBootstrap(); // keep offline cache warm (native only)
  useShellCatalogBootstrap(); // warm Redux catalog once after auth (web perf)

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
          <NativeLifecycleBanner />
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
