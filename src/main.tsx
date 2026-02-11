import React from "react";
import ReactDOM from "react-dom/client";
import { CssBaseline, ThemeProvider } from "@mui/material";
import { Provider } from "react-redux";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import { store } from "./store";
import theme from "./theme/theme";
import { FieldNotificationProvider } from "./contexts/FieldNotificationContext";
import { ViewModeProvider } from "./contexts/ViewModeContext";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <ViewModeProvider>
            <FieldNotificationProvider>
              <App />
            </FieldNotificationProvider>
          </ViewModeProvider>
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  </React.StrictMode>
);
