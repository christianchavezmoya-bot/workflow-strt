import { PersonOutlined } from "@mui/icons-material";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import DashboardAttentionItemRow from "./DashboardAttentionItemRow";
import { fmtDate, type AutoAssignFlag } from "./dashboardPageLogic";

const AUTO_ASSIGN_STORAGE_KEY = "pm_auto_assign_flags";

type Props = {
  flags: AutoAssignFlag[];
  onFlagsChange: (flags: AutoAssignFlag[]) => void;
  onNavigateToAssets: () => void;
  assignedByLabel?: "by" | "to";
};

export default function DashboardAutoAssignFlagsSection({
  flags,
  onFlagsChange,
  onNavigateToAssets,
  assignedByLabel = "by",
}: Props) {
  if (flags.length === 0) return null;

  const assignedPrefix = assignedByLabel === "to" ? "Assigned to" : "Assigned by";
  const assignedSeparator = assignedByLabel === "to" ? " - " : " · ";

  function dismissAll() {
    localStorage.removeItem(AUTO_ASSIGN_STORAGE_KEY);
    onFlagsChange([]);
  }

  function dismissOne(flagId: string) {
    const updated = flags.filter((flag) => flag.id !== flagId);
    localStorage.setItem(AUTO_ASSIGN_STORAGE_KEY, JSON.stringify(updated));
    onFlagsChange(updated);
  }

  return (
    <Box
      className="glass-card"
      sx={{ p: 2, border: "1px solid", borderColor: "info.dark", background: "rgba(2,136,209,0.07)" }}
    >
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <PersonOutlined sx={{ fontSize: 18, color: "info.main" }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
          New Auto-assignments
        </Typography>
        <Chip label={flags.length} size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: "0.7rem" }} />
        <Button size="small" variant="text" color="info" sx={{ fontSize: "0.72rem" }} onClick={dismissAll}>
          Dismiss all
        </Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
        {assignedByLabel === "to"
          ? "Assets that were auto-assigned when an installer started a workflow"
          : "Assets auto-assigned when an installer started a workflow"}
      </Typography>
      <Stack spacing={0.25}>
        {flags.map((flag) => (
          <Stack key={flag.id} direction="row" alignItems="center" spacing={1}>
            <Box sx={{ flex: 1 }}>
              <DashboardAttentionItemRow
                label={`${flag.jobNumber ? `${flag.jobNumber}: ` : ""}${flag.assetTag}`}
                sub={`${assignedPrefix} ${flag.assignedBy}${assignedSeparator}${fmtDate(flag.assignedAt)}`}
                onClick={onNavigateToAssets}
              />
            </Box>
            <Button
              size="small"
              variant="text"
              color="inherit"
              sx={{ fontSize: "0.65rem", minWidth: 0, px: 1, opacity: 0.6 }}
              onClick={() => dismissOne(flag.id)}
            >
              ×
            </Button>
          </Stack>
        ))}
      </Stack>
    </Box>
  );
}
