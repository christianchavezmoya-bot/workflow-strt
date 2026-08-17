import { CloseOutlined, ErrorOutlineOutlined, PersonOutlined, SwitchAccountOutlined, WorkOutlineOutlined } from "@mui/icons-material";
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
import type { PmDashboardTab } from "./dashboardPageLogic";

type DashboardUserOption = {
  id: string;
  fullName: string;
  role: string;
};

type Props = {
  showAdminOverviewStrip: boolean;
  viewingOwnDashboard: boolean;
  userFullName: string;
  userRole: string;
  viewedDashboardUser: DashboardUserOption | null;
  isManager: boolean;
  isAdmin: boolean;
  dashboardUsers: DashboardUserOption[];
  selectedDashboardId: string;
  allDashboardsValue: string;
  userId: string;
  pmDashboardTab: PmDashboardTab;
  overviewActiveCount: number;
  overviewPausedCount: number;
  overviewQueuedCount: number;
  overviewPendingCount: number;
  overviewBlockingCount: number;
  onSelectedDashboardIdChange: (userId: string) => void;
};

export default function DashboardWorkspaceHeader({
  showAdminOverviewStrip,
  viewingOwnDashboard,
  userFullName,
  userRole,
  viewedDashboardUser,
  isManager,
  isAdmin,
  dashboardUsers,
  selectedDashboardId,
  allDashboardsValue,
  userId,
  pmDashboardTab,
  overviewActiveCount,
  overviewPausedCount,
  overviewQueuedCount,
  overviewPendingCount,
  overviewBlockingCount,
  onSelectedDashboardIdChange,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2.5 }}>
      {isManager && !viewingOwnDashboard && viewedDashboardUser && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mb: 1.5,
            p: 1,
            borderRadius: 1,
            background: "rgba(2,136,209,0.1)",
            border: "1px solid rgba(2,136,209,0.3)",
          }}
        >
          <SwitchAccountOutlined sx={{ fontSize: 16, color: "info.main", flexShrink: 0 }} />
          <Typography variant="caption" sx={{ flex: 1, color: "info.main" }}>
            Viewing {viewedDashboardUser.fullName} ({viewedDashboardUser.role}) dashboard - read only
          </Typography>
          <IconButton size="small" onClick={() => onSelectedDashboardIdChange(userId)}>
            <CloseOutlined fontSize="small" />
          </IconButton>
        </Box>
      )}
      <Stack direction="row" alignItems="center" spacing={1.5}>
        <PersonOutlined
          sx={{
            color: showAdminOverviewStrip ? "info.main" : viewingOwnDashboard ? "primary.main" : "info.main",
            fontSize: 20,
          }}
        />
        <Box sx={{ flex: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", lineHeight: 1.2 }}>
            {showAdminOverviewStrip
              ? "Admin Oversight"
              : viewingOwnDashboard
                ? userFullName
                : viewedDashboardUser?.fullName ?? userFullName}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {showAdminOverviewStrip
              ? "Active projects and assets in the current dashboard scope"
              : viewingOwnDashboard
                ? userRole
                : viewedDashboardUser?.role ?? ""}
          </Typography>
        </Box>
        {isManager && (dashboardUsers.length > 0 || selectedDashboardId !== userId) && (
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel shrink>View as</InputLabel>
            <Select
              label="View as"
              value={selectedDashboardId}
              onChange={(event) => onSelectedDashboardIdChange(event.target.value)}
            >
              {isAdmin && (
                <MenuItem value={allDashboardsValue}>
                  <em>All Dashboards</em>
                </MenuItem>
              )}
              <MenuItem value={userId}>
                <em>My Dashboard</em>
              </MenuItem>
              {dashboardUsers.map((dashboardUser) => (
                <MenuItem key={dashboardUser.id} value={dashboardUser.id}>
                  {dashboardUser.fullName} ({dashboardUser.role})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}
        <Stack direction="row" spacing={0.75} sx={{ flexWrap: "wrap", gap: 0.5 }}>
          {pmDashboardTab !== "my-inspections" && (
            <>
              <Chip
                icon={<WorkOutlineOutlined sx={{ fontSize: 13 }} />}
                label={`${overviewActiveCount} active`}
                size="small"
                color={overviewActiveCount > 0 ? "primary" : "default"}
                variant="outlined"
                sx={{ height: 22, fontSize: "0.7rem" }}
              />
              <Tooltip title="Workflow run is currently paused" arrow>
                <Chip
                  label={`${overviewPausedCount} paused`}
                  size="small"
                  color={overviewPausedCount > 0 ? "warning" : "default"}
                  variant="outlined"
                  sx={{ height: 22, fontSize: "0.7rem", cursor: "help" }}
                />
              </Tooltip>
              <Tooltip title="No workflow run has been started yet" arrow>
                <Chip
                  label={`${overviewQueuedCount} queued`}
                  size="small"
                  color="default"
                  variant="outlined"
                  sx={{ height: 22, fontSize: "0.7rem", cursor: "help" }}
                />
              </Tooltip>
              {overviewPendingCount > 0 && (
                <Tooltip title="Asset is assigned and acknowledged but the workflow hasn't started" arrow>
                  <Chip
                    label={`${overviewPendingCount} pending`}
                    size="small"
                    color="info"
                    variant="outlined"
                    sx={{ height: 22, fontSize: "0.7rem", cursor: "help" }}
                  />
                </Tooltip>
              )}
              {overviewBlockingCount > 0 && (
                <Chip
                  icon={<ErrorOutlineOutlined sx={{ fontSize: 13 }} />}
                  label={`${overviewBlockingCount} blocking`}
                  size="small"
                  color="error"
                  variant="outlined"
                  sx={{ height: 22, fontSize: "0.7rem" }}
                />
              )}
            </>
          )}
        </Stack>
      </Stack>
    </Box>
  );
}
