import { Box } from "@mui/material";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";
import DebugPanel from "./DebugPanel";
import FieldNotificationBar from "../FieldNotificationBar";

const AppShell = () => {
  return (
    <Box className="app-shell">
      <Sidebar />
      <Box className="app-main">
        <Topbar />
        <FieldNotificationBar />
        <Box component="main" className="app-content">
          <Outlet />
        </Box>
      </Box>
      <DebugPanel />
    </Box>
  );
};

export default AppShell;
