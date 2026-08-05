import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { Provider } from "react-redux";
import { BrowserRouter, type FutureConfig } from "react-router-dom";
import App from "./app/App";
import { store } from "./store";
import theme from "./theme/theme";
import { FieldNotificationProvider } from "./contexts/FieldNotificationContext";
import { ViewModeProvider } from "./contexts/ViewModeContext";
import { AccessModeProvider } from "./contexts/AccessModeContext";
import { NotificationInboxProvider } from "./contexts/NotificationInboxContext";
import { ComplexViewProvider } from "./contexts/ComplexViewContext";
import { OfflineModeProvider } from "./contexts/OfflineModeContext";
import "./index.css";
import { defineCustomElements } from "@ionic/pwa-elements/loader";

// Bootstrap Ionic PWA elements for Camera/FilePicker web fallbacks
defineCustomElements(window);

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
        <BrowserRouter future={ROUTER_FUTURE}>
          <ComplexViewProvider>
            <AccessModeProvider>
              <NotificationInboxProvider>
                <ViewModeProvider>
                  <OfflineModeProvider>
                    <FieldNotificationProvider>
                      <App />
                    </FieldNotificationProvider>
                  </OfflineModeProvider>
                </ViewModeProvider>
              </NotificationInboxProvider>
            </AccessModeProvider>
          </ComplexViewProvider>
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>
);
