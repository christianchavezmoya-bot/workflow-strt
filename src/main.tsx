import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { Provider } from "react-redux";
import { BrowserRouter, type FutureConfig } from "react-router-dom";
import App from "./app/App";
import { store } from "./store";
import theme from "./theme/theme";
import { FieldNotificationProvider } from "./contexts/FieldNotificationContext";
import { AppToastProvider } from "./contexts/AppToastContext";
import { ConfirmProvider } from "./contexts/ConfirmContext";
import { ViewModeProvider } from "./contexts/ViewModeContext";
import { AccessModeProvider } from "./contexts/AccessModeContext";
import { NotificationInboxProvider } from "./contexts/NotificationInboxContext";
import { ComplexViewProvider } from "./contexts/ComplexViewContext";
import { OfflineModeProvider } from "./contexts/OfflineModeContext";
import FaultBoundary from "./components/FaultBoundary";
import { installFaultCapture } from "./services/faultReporting";
import "./index.css";
import { defineCustomElements } from "@ionic/pwa-elements/loader";

// Bootstrap Ionic PWA elements for Camera/FilePicker web fallbacks
defineCustomElements(window);

// Catch uncaught errors and rejections, and flush anything queued offline.
// Installed before render so a crash during mount is still recorded.
installFaultCapture();

// React Router v7 prep — non-blocking navigations (web perf Phase 4).
const ROUTER_FUTURE: Partial<FutureConfig> = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

// Render immediately — Capacitor native bridge is not ready before mount.
// initSecureStorage() is called inside App.tsx via useEffect after mount.
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <FaultBoundary>
          <BrowserRouter future={ROUTER_FUTURE}>
            <ComplexViewProvider>
              <AccessModeProvider>
                <NotificationInboxProvider>
                  <AppToastProvider>
                    <ConfirmProvider>
                      <ViewModeProvider>
                        <OfflineModeProvider>
                          <FieldNotificationProvider>
                            <App />
                          </FieldNotificationProvider>
                        </OfflineModeProvider>
                      </ViewModeProvider>
                    </ConfirmProvider>
                  </AppToastProvider>
                </NotificationInboxProvider>
              </AccessModeProvider>
            </ComplexViewProvider>
          </BrowserRouter>
        </FaultBoundary>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>
);
