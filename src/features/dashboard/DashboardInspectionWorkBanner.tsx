import { AssignmentLateOutlined } from "@mui/icons-material";
import { Box, Button, Chip, Stack, Typography } from "@mui/material";

type Props = {
  inspectionRunsDue: number;
  onOpenInspections: () => void;
};

export default function DashboardInspectionWorkBanner({ inspectionRunsDue, onOpenInspections }: Props) {
  if (inspectionRunsDue <= 0) return null;

  return (
    <Box className="glass-card" sx={{ p: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
        <AssignmentLateOutlined sx={{ fontSize: 18, color: "info.main" }} />
        <Stack direction="row" spacing={0.75} alignItems="center" sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ fontFamily: "Sora" }}>
            Inspection Work
          </Typography>
          <Chip label={inspectionRunsDue} size="small" color="info" variant="filled" sx={{ height: 18, fontSize: "0.62rem", fontWeight: 700 }} />
        </Stack>
      </Stack>
      <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
        Internal inspections assigned to you and still open
      </Typography>
      <Button size="small" variant="outlined" color="info" onClick={onOpenInspections}>
        Open inspections
      </Button>
    </Box>
  );
}
