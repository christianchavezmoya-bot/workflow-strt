import { Box, Tab, Tabs } from "@mui/material";
import type { ReactNode } from "react";
import { getDashboardTabSx, type DashboardTabSignal, type PmDashboardTab } from "./dashboardPageLogic";

type Props = {
  pmDashboardTab: PmDashboardTab;
  showPmProjectsTab: boolean;
  hasInspectionsTab: boolean;
  isAdmin: boolean;
  projectTabSignal: DashboardTabSignal;
  inspectionTabSignal: DashboardTabSignal;
  installTabSignal: DashboardTabSignal;
  renderTabLabel: (title: string, signal: DashboardTabSignal) => ReactNode;
  onTabChange: (tab: PmDashboardTab) => void;
};

export default function DashboardTabBar({
  pmDashboardTab,
  showPmProjectsTab,
  hasInspectionsTab,
  isAdmin,
  projectTabSignal,
  inspectionTabSignal,
  installTabSignal,
  renderTabLabel,
  onTabChange,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 1.5 }}>
      <Tabs value={pmDashboardTab} onChange={(_, value: PmDashboardTab) => onTabChange(value)} sx={{ minHeight: 36 }}>
        {showPmProjectsTab && (
          <Tab
            value="pm-projects"
            label={renderTabLabel(isAdmin ? "Projects" : "My PM Projects", projectTabSignal)}
            sx={getDashboardTabSx()}
          />
        )}
        {hasInspectionsTab && (
          <Tab
            value="my-inspections"
            label={renderTabLabel(isAdmin ? "Inspections" : "My Inspections", inspectionTabSignal)}
            sx={getDashboardTabSx()}
          />
        )}
        <Tab
          value="my-installs"
          label={renderTabLabel(isAdmin ? "Installs" : "My Installs", installTabSignal)}
          sx={getDashboardTabSx()}
        />
      </Tabs>
    </Box>
  );
}
