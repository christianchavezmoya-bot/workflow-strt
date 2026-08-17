import { CheckCircleOutlined } from "@mui/icons-material";
import { Box, Chip, Stack, Tooltip, Typography } from "@mui/material";
import { formatInstant } from "../../utils/datetime";

type Props = {
  label: string;
  sub?: string;
  onClick: () => void;
  actionLabel?: string;
  customerLinkSentAt?: string | null;
  projectTimeZoneId?: string | null;
  requestSent?: boolean;
};

export default function DashboardAttentionItemRow({
  label,
  sub,
  onClick,
  actionLabel,
  customerLinkSentAt,
  projectTimeZoneId,
  requestSent,
}: Props) {
  return (
    <Stack
      direction="row"
      spacing={1}
      alignItems="center"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{
        px: 1,
        py: 0.5,
        borderRadius: 1,
        cursor: "pointer",
        "&:hover": { background: "rgba(255,255,255,0.07)" },
        transition: "background 0.15s",
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" noWrap display="block">
          - {label}
        </Typography>
        {sub && (
          <Typography
            variant="caption"
            color="text.disabled"
            noWrap
            display="block"
            sx={{ pl: 1.5, fontSize: "0.65rem" }}
          >
            {sub}
          </Typography>
        )}
      </Box>
      {actionLabel && (
        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexShrink: 0 }}>
          {requestSent && (
            <Stack direction="row" spacing={0.35} alignItems="center">
              <CheckCircleOutlined sx={{ fontSize: 16, color: "success.main" }} onClick={(e) => e.stopPropagation()} />
              <Typography variant="caption" color="success.main" sx={{ fontSize: "0.6rem" }}>
                Request sent
              </Typography>
            </Stack>
          )}
          {customerLinkSentAt && (
            <Tooltip title={`Link sent ${formatInstant(customerLinkSentAt, projectTimeZoneId, { withZone: true })}`} arrow>
              <CheckCircleOutlined sx={{ fontSize: 16, color: "success.main" }} onClick={(e) => e.stopPropagation()} />
            </Tooltip>
          )}
          <Chip label={actionLabel} size="small" color="info" variant="outlined" sx={{ height: 18, fontSize: "0.6rem" }} />
        </Stack>
      )}
    </Stack>
  );
}
