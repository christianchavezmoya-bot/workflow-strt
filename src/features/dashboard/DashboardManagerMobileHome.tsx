import { CloseOutlined, PlayArrowOutlined, SwitchAccountOutlined } from "@mui/icons-material";
import {
  Box,
  Chip,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import type { DashboardTabSignal } from "./dashboardPageLogic";

export type ManagerMobileTab = "projects" | "inspections" | "installs";

type DashboardUserOption = {
  id: string;
  fullName: string;
  role: string;
};

type Props = {
  userFullName: string;
  userRole: string;
  userId: string;
  activeOffice: string;
  overviewActiveCount: number;
  overviewPausedCount: number;
  overviewQueuedCount: number;
  overviewPendingCount: number;
  isAdmin: boolean;
  dashboardUsers: DashboardUserOption[];
  viewingOwnDashboard: boolean;
  viewedDashboardUser: DashboardUserOption | null;
  selectedDashboardId: string;
  allDashboardsValue: string;
  onSelectedDashboardIdChange: (userId: string) => void;
  mobileManagerTab: ManagerMobileTab;
  onMobileManagerTabChange: (tab: ManagerMobileTab) => void;
  projectTabSignal: DashboardTabSignal;
  inspectionTabSignal: DashboardTabSignal;
  installTabSignal: DashboardTabSignal;
  renderTabLabel: (title: string, signal: DashboardTabSignal) => ReactNode;
  projectsTab: ReactNode;
  inspectionsTab: ReactNode;
  installsTab: ReactNode;
};

export default function DashboardManagerMobileHome({
  userFullName,
  userRole,
  userId,
  activeOffice,
  overviewActiveCount,
  overviewPausedCount,
  overviewQueuedCount,
  overviewPendingCount,
  isAdmin,
  dashboardUsers,
  viewingOwnDashboard,
  viewedDashboardUser,
  selectedDashboardId,
  allDashboardsValue,
  onSelectedDashboardIdChange,
  mobileManagerTab,
  onMobileManagerTabChange,
  projectTabSignal,
  inspectionTabSignal,
  installTabSignal,
  renderTabLabel,
  projectsTab,
  inspectionsTab,
  installsTab,
}: Props) {
  const mobileTabs = [
    { key: "projects" as const, label: isAdmin ? "Projects" : "My Projects", signal: projectTabSignal },
    { key: "inspections" as const, label: isAdmin ? "Inspections" : "My Inspections", signal: inspectionTabSignal },
    { key: "installs" as const, label: isAdmin ? "Installs" : "My Installs", signal: installTabSignal },
  ] as const;

  return (
    <Stack spacing={2}>
      <Box className="glass-card" sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="h6" sx={{ fontFamily: "Sora", lineHeight: 1.1 }}>
              {userFullName}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {userRole} · {activeOffice === "All" ? "All offices" : activeOffice}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.5 }}>
            <Tooltip title="Workflow run is currently active" arrow>
              <Chip
                icon={<PlayArrowOutlined sx={{ fontSize: 13 }} />}
                label={`${overviewActiveCount} active`}
                size="small"
                color={overviewActiveCount > 0 ? "primary" : "default"}
                variant="outlined"
                sx={{ height: 22, fontSize: "0.7rem" }}
              />
            </Tooltip>
            <Tooltip title="Workflow run is currently paused" arrow>
              <Chip
                label={`${overviewPausedCount} paused`}
                size="small"
                color={overviewPausedCount > 0 ? "warning" : "default"}
                variant="outlined"
                sx={{ height: 22, fontSize: "0.7rem" }}
              />
            </Tooltip>
            <Tooltip title="Assigned, no workflow run started yet" arrow>
              <Chip label={`${overviewQueuedCount} queued`} size="small" color="default" variant="outlined" sx={{ height: 22, fontSize: "0.7rem" }} />
            </Tooltip>
            {overviewPendingCount > 0 && (
              <Tooltip title="Asset acknowledged but workflow hasn't started" arrow>
                <Chip label={`${overviewPendingCount} pending`} size="small" color="info" variant="outlined" sx={{ height: 22, fontSize: "0.7rem" }} />
              </Tooltip>
            )}
          </Stack>
          {isAdmin && dashboardUsers.length > 0 && (
            <Box>
              {!viewingOwnDashboard && viewedDashboardUser && (
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    mb: 1,
                    p: 0.75,
                    borderRadius: 1,
                    background: "rgba(2,136,209,0.1)",
                    border: "1px solid rgba(2,136,209,0.3)",
                  }}
                >
                  <SwitchAccountOutlined sx={{ fontSize: 14, color: "info.main", flexShrink: 0 }} />
                  <Typography variant="caption" sx={{ flex: 1, color: "info.main", fontSize: "0.7rem" }}>
                    Viewing {viewedDashboardUser.fullName} ({viewedDashboardUser.role})
                  </Typography>
                  <IconButton size="small" onClick={() => onSelectedDashboardIdChange(userId)} sx={{ p: 0.25 }}>
                    <CloseOutlined sx={{ fontSize: 14 }} />
                  </IconButton>
                </Box>
              )}
              <FormControl size="small" fullWidth>
                <InputLabel shrink sx={{ fontSize: "0.75rem" }}>
                  View as
                </InputLabel>
                <Select
                  label="View as"
                  value={selectedDashboardId === allDashboardsValue ? userId : selectedDashboardId}
                  onChange={(e) => onSelectedDashboardIdChange(e.target.value)}
                  sx={{ fontSize: "0.75rem" }}
                >
                  <MenuItem value={userId}>
                    <em>My Dashboard</em>
                  </MenuItem>
                  {dashboardUsers.map((u) => (
                    <MenuItem key={u.id} value={u.id} sx={{ fontSize: "0.8rem" }}>
                      {u.fullName} ({u.role})
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>
          )}
        </Stack>
      </Box>

      <Stack direction="row" spacing={1}>
        {mobileTabs.map((tab) => (
          <Chip
            key={tab.key}
            label={renderTabLabel(tab.label, tab.signal)}
            clickable
            color={mobileManagerTab === tab.key ? "primary" : "default"}
            variant={mobileManagerTab === tab.key ? "filled" : "outlined"}
            onClick={() => onMobileManagerTabChange(tab.key)}
            sx={{
              flex: 1,
              minWidth: 0,
              height: "auto",
              minHeight: 34,
              py: 0.5,
              "& .MuiChip-label": {
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                px: 0.5,
              },
            }}
          />
        ))}
      </Stack>

      {mobileManagerTab === "projects" && projectsTab}
      {mobileManagerTab === "inspections" && inspectionsTab}
      {mobileManagerTab === "installs" && installsTab}
    </Stack>
  );
}
