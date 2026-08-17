import { AssignmentLateOutlined } from "@mui/icons-material";
import { Box, Chip, Stack, Typography } from "@mui/material";

type Props = {
  inspectionRunsDue: number;
  inspectionImportsWaiting: number;
  inspectionImportsFailed: number;
  onNavigateToInspectionAssets: () => void;
};

export default function DashboardInspectionInboxSection({
  inspectionRunsDue,
  inspectionImportsWaiting,
  inspectionImportsFailed,
  onNavigateToInspectionAssets,
}: Props) {
  return (
    <Box className="glass-card" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <AssignmentLateOutlined sx={{ fontSize: 18, color: "info.main" }} />
        <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora", flex: 1 }}>
          Inspection Inbox
        </Typography>
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.25 }}>
        Open inspection runs and JSON imports across projects in your current dashboard scope.
      </Typography>
      <Stack direction="row" spacing={2} flexWrap="wrap">
        {inspectionRunsDue > 0 && (
          <Chip
            label={inspectionRunsDue + (inspectionRunsDue === 1 ? " run" : " runs") + " due / in progress"}
            size="small"
            color="info"
            variant="outlined"
            onClick={onNavigateToInspectionAssets}
            sx={{ cursor: "pointer" }}
          />
        )}
        {inspectionImportsWaiting > 0 && (
          <Chip
            label={
              inspectionImportsWaiting +
              (inspectionImportsWaiting === 1 ? " import" : " imports") +
              " need assignment"
            }
            size="small"
            color="warning"
            variant="outlined"
          />
        )}
        {inspectionImportsFailed > 0 && (
          <Chip
            label={
              inspectionImportsFailed + (inspectionImportsFailed === 1 ? " import" : " imports") + " failed"
            }
            size="small"
            color="error"
            variant="outlined"
          />
        )}
      </Stack>
    </Box>
  );
}
